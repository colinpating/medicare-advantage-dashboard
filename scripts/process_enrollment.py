#!/usr/bin/env python3
"""
Process CMS CPSC enrollment data into JSON for the dashboard.

Parses the CSV file, aggregates enrollment by county/org/plan type,
and calculates changes from December baseline.
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd

# Data directories
DATA_DIR = Path(__file__).parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

# Parent organization mapping (contract prefix → parent org)
# Based on major MAOs controlling ~70% of the market
PARENT_ORG_MAPPING = {
    # UnitedHealth Group
    "H0028": "UnitedHealth Group",
    "H0543": "UnitedHealth Group",
    "H0754": "UnitedHealth Group",
    "H1045": "UnitedHealth Group",
    "H1685": "UnitedHealth Group",
    "H2001": "UnitedHealth Group",
    "H2168": "UnitedHealth Group",
    "H2406": "UnitedHealth Group",
    "H3749": "UnitedHealth Group",
    "H4091": "UnitedHealth Group",
    "H5253": "UnitedHealth Group",
    "H5521": "UnitedHealth Group",
    "H6501": "UnitedHealth Group",
    "H7657": "UnitedHealth Group",
    "R5826": "UnitedHealth Group",

    # CVS Health (Aetna)
    "H0112": "CVS Health (Aetna)",
    "H0318": "CVS Health (Aetna)",
    "H0485": "CVS Health (Aetna)",
    "H0533": "CVS Health (Aetna)",
    "H1609": "CVS Health (Aetna)",
    "H2478": "CVS Health (Aetna)",
    "H3152": "CVS Health (Aetna)",
    "H3312": "CVS Health (Aetna)",
    "H3597": "CVS Health (Aetna)",
    "H4002": "CVS Health (Aetna)",
    "H4448": "CVS Health (Aetna)",
    "H5521": "CVS Health (Aetna)",
    "H9851": "CVS Health (Aetna)",

    # Humana
    "H0028": "Humana",
    "H1036": "Humana",
    "H1406": "Humana",
    "H1951": "Humana",
    "H2649": "Humana",
    "H4141": "Humana",
    "H4461": "Humana",
    "H5216": "Humana",
    "H5619": "Humana",
    "H6622": "Humana",
    "H7495": "Humana",
    "H8145": "Humana",
    "R5826": "Humana",

    # Elevance Health (Anthem)
    "H0146": "Elevance Health (Anthem)",
    "H0354": "Elevance Health (Anthem)",
    "H0540": "Elevance Health (Anthem)",
    "H2006": "Elevance Health (Anthem)",
    "H3655": "Elevance Health (Anthem)",
    "H3905": "Elevance Health (Anthem)",
    "H4624": "Elevance Health (Anthem)",
    "H5853": "Elevance Health (Anthem)",
    "H9019": "Elevance Health (Anthem)",

    # Centene
    "H0169": "Centene",
    "H1485": "Centene",
    "H2712": "Centene",
    "H3447": "Centene",
    "H4007": "Centene",
    "H5427": "Centene",
    "H6832": "Centene",

    # Kaiser Permanente
    "H0524": "Kaiser Permanente",
    "H0630": "Kaiser Permanente",
    "H2172": "Kaiser Permanente",
    "H9003": "Kaiser Permanente",

    # Cigna
    "H0107": "Cigna",
    "H0354": "Cigna",
    "H4513": "Cigna",
    "H5410": "Cigna",
    "H6373": "Cigna",

    # Molina Healthcare
    "H0169": "Molina Healthcare",
    "H0420": "Molina Healthcare",
    "H5823": "Molina Healthcare",
    "H9498": "Molina Healthcare",

    # Blue Cross Blue Shield (various)
    "H0404": "BCBS",
    "H0520": "BCBS",
    "H1350": "BCBS",
    "H2819": "BCBS",
    "H3949": "BCBS",
    "H5008": "BCBS",
    "H6502": "BCBS",
}


def identify_plan_type(contract_id: str, plan_name: str, org_type: str = "") -> str:
    """
    Identify plan type from contract ID and plan name.

    Contract prefixes:
    - H: HMO/Local MA
    - R: Regional PPO
    - S: Stand-alone PDP (not MA)
    - E: Employer Group

    DSNP identified via org type or plan name keywords.
    PFFS and other minor types are grouped into "Other".
    """
    if not contract_id:
        return "Other"

    prefix = contract_id[0].upper()

    # Check for DSNP first
    dsnp_keywords = ["dsnp", "dual", "d-snp", "dual eligible", "dual-eligible"]
    plan_name_lower = (plan_name or "").lower()
    org_type_lower = (org_type or "").lower()

    if any(kw in plan_name_lower or kw in org_type_lower for kw in dsnp_keywords):
        return "DSNP"

    # Determine base type from contract prefix
    if prefix == "H":
        # Could be HMO or PPO - check plan name for hints
        if "ppo" in plan_name_lower:
            return "PPO"
        else:
            return "HMO"
    elif prefix == "R":
        return "PPO"  # Regional PPO
    else:
        return "Other"


def get_parent_org(contract_id: str, org_name: str = "") -> str:
    """
    Get parent organization from contract ID or organization name.
    """
    if not contract_id:
        return "Other"

    # Check direct mapping first
    contract_base = contract_id[:5] if len(contract_id) >= 5 else contract_id
    if contract_base in PARENT_ORG_MAPPING:
        return PARENT_ORG_MAPPING[contract_base]

    # Try to infer from organization name
    org_name_lower = (org_name or "").lower()

    org_keywords = {
        "UnitedHealth Group": ["united", "uhc", "optum", "pacificare"],
        "CVS Health (Aetna)": ["aetna", "cvs"],
        "Humana": ["humana"],
        "Elevance Health (Anthem)": ["anthem", "wellpoint", "elevance"],
        "Centene": ["centene", "wellcare", "health net"],
        "Kaiser Permanente": ["kaiser"],
        "Cigna": ["cigna"],
        "Molina Healthcare": ["molina"],
        "BCBS": ["blue cross", "blue shield", "bcbs", "anthem"],
    }

    for parent, keywords in org_keywords.items():
        if any(kw in org_name_lower for kw in keywords):
            return parent

    return "Other"


def load_contract_info(csv_path: Path) -> dict:
    """
    Load contract info file to get organization mappings.
    Returns dict mapping contract_number to parent_organization.
    """
    # Look for contract info file in same directory
    parent_dir = csv_path.parent
    contract_files = list(parent_dir.glob("*contract_info*.csv"))

    if not contract_files:
        print("No contract info file found, using built-in mapping")
        return {}

    contract_path = contract_files[0]
    print(f"Loading contract info from: {contract_path}")

    # Try multiple encodings
    encodings = ['utf-8', 'cp1252', 'latin-1']
    df = None

    for encoding in encodings:
        try:
            df = pd.read_csv(contract_path, dtype=str, encoding=encoding)
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    if df is None:
        print("Could not read contract info file")
        return {}

    # Standardize column names
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

    # Build mapping from contract number to parent organization
    contract_to_org = {}

    # Look for parent organization column
    parent_col = None
    for col in ['parent_organization', 'parent_org', 'organization', 'organization_name']:
        if col in df.columns:
            parent_col = col
            break

    contract_col = None
    for col in ['contract_number', 'contract_id', 'contractid']:
        if col in df.columns:
            contract_col = col
            break

    if parent_col and contract_col:
        for _, row in df.iterrows():
            contract = row[contract_col]
            org = row[parent_col]
            if pd.notna(contract) and pd.notna(org):
                contract_to_org[contract] = org

    print(f"Loaded {len(contract_to_org)} contract-to-org mappings")
    return contract_to_org


def process_csv(csv_path: Path) -> pd.DataFrame:
    """
    Read and process the CMS CPSC CSV file.
    """
    print(f"Reading CSV: {csv_path}")

    # CMS CSVs can have varying encodings - try multiple
    encodings = ['utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
    df = None

    for encoding in encodings:
        try:
            df = pd.read_csv(csv_path, dtype=str, low_memory=False, encoding=encoding)
            print(f"Successfully read with encoding: {encoding}")
            break
        except (UnicodeDecodeError, UnicodeError):
            continue

    if df is None:
        raise ValueError(f"Could not read CSV with any encoding: {encodings}")

    # Standardize column names
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')

    # Common column name mappings
    column_mappings = {
        'contract_number': ['contract_number', 'contractid', 'contract_id', 'h_number'],
        'plan_id': ['plan_id', 'planid', 'plan_number'],
        'state': ['state', 'state_code', 'bene_state'],
        'county': ['county', 'county_name', 'bene_county'],
        'fips': ['fips', 'fips_code', 'county_fips', 'ssa_code', 'fips_state_county_code'],
        'enrollment': ['enrollment', 'total_enrollment', 'enrolled', 'member_count', 'enrollees'],
        'organization': ['organization_name', 'org_name', 'organization', 'plan_org_name', 'parent_organization'],
        'plan_name': ['plan_name', 'plan_benefit_package_name', 'pbp_name'],
        'org_type': ['organization_type', 'org_type', 'special_needs_plan_type'],
    }

    # Apply mappings
    renamed = {}
    for standard_name, variations in column_mappings.items():
        for var in variations:
            if var in df.columns:
                renamed[var] = standard_name
                break

    df = df.rename(columns=renamed)

    # Ensure required columns exist
    required = ['contract_number', 'state', 'enrollment']
    missing = [col for col in required if col not in df.columns]
    if missing:
        print(f"Available columns: {list(df.columns)}")
        raise ValueError(f"Missing required columns: {missing}")

    # Clean enrollment data - handle both string and numeric types
    if df['enrollment'].dtype == 'object':
        df['enrollment'] = df['enrollment'].str.replace(',', '')
    df['enrollment'] = pd.to_numeric(df['enrollment'], errors='coerce').fillna(0).astype(int)

    # CMS masks values <11 with '*' - these become 0 after coercion
    # We'll keep them as 0 for aggregation

    # Load contract info for organization mapping
    contract_to_org = load_contract_info(csv_path)

    # Add organization column from contract info or fallback mapping
    if 'organization' not in df.columns:
        def get_org(contract):
            if pd.isna(contract):
                return 'Other'
            # First try contract info file
            if contract in contract_to_org:
                return contract_to_org[contract]
            # Fallback to built-in mapping
            return get_parent_org(contract, '')

        df['organization'] = df['contract_number'].apply(get_org)

    return df


def aggregate_enrollment(df: pd.DataFrame) -> dict:
    """
    Aggregate enrollment data by county, organization, and plan type.
    """
    # Add derived columns
    df['plan_type'] = df.apply(
        lambda r: identify_plan_type(
            r.get('contract_number', ''),
            r.get('plan_name', ''),
            r.get('org_type', '')
        ),
        axis=1
    )

    # Use organization column directly (from contract info) as parent_org
    if 'organization' in df.columns:
        df['parent_org'] = df['organization']
    else:
        df['parent_org'] = df.apply(
            lambda r: get_parent_org(
                r.get('contract_number', ''),
                ''
            ),
            axis=1
        )

    # Build FIPS code if not present
    if 'fips' not in df.columns:
        # Try to build from state + county codes if available
        df['fips'] = ''

    # Aggregate by county (state + county combination as fallback)
    result = {
        'metadata': {
            'processed_date': datetime.now().isoformat(),
            'record_count': len(df),
            'total_enrollment': int(df['enrollment'].sum()),
        },
        'counties': {},
        'by_org': {},
        'by_plan_type': {},
        'by_state': {},
        'contracts': {},
    }

    # County-level aggregation
    county_group = df.groupby(['state', 'county'] if 'county' in df.columns else ['state'])

    for keys, group in county_group:
        if isinstance(keys, tuple):
            state, county = keys
            county_key = f"{state}_{county}".replace(' ', '_').lower()
        else:
            state = keys
            county = "Unknown"
            county_key = f"{state}_unknown"

        fips_values = group['fips'].dropna().unique()
        fips = fips_values[0] if len(fips_values) > 0 and fips_values[0] else county_key

        county_data = {
            'state': state,
            'county': county,
            'fips': fips,
            'total': int(group['enrollment'].sum()),
            'by_org': group.groupby('parent_org')['enrollment'].sum().to_dict(),
            'by_plan_type': group.groupby('plan_type')['enrollment'].sum().to_dict(),
            'contracts': group.groupby('contract_number')['enrollment'].sum().to_dict()
        }

        # Convert numpy int64 to Python int
        county_data['by_org'] = {k: int(v) for k, v in county_data['by_org'].items()}
        county_data['by_plan_type'] = {k: int(v) for k, v in county_data['by_plan_type'].items()}
        county_data['contracts'] = {k: int(v) for k, v in county_data['contracts'].items()}

        result['counties'][fips] = county_data

    # Organization totals
    org_totals = df.groupby('parent_org')['enrollment'].sum()
    result['by_org'] = {k: int(v) for k, v in org_totals.to_dict().items()}

    # Plan type totals
    plan_type_totals = df.groupby('plan_type')['enrollment'].sum()
    result['by_plan_type'] = {k: int(v) for k, v in plan_type_totals.to_dict().items()}

    # State totals
    state_totals = df.groupby('state')['enrollment'].sum()
    result['by_state'] = {k: int(v) for k, v in state_totals.to_dict().items()}

    # Contract details
    agg_dict = {
        'enrollment': 'sum',
        'parent_org': 'first',
        'plan_type': lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else 'Unknown',
    }

    # Only include organization if it exists in the dataframe
    if 'organization' in df.columns:
        agg_dict['organization'] = 'first'

    contract_info = df.groupby('contract_number').agg(agg_dict).to_dict('index')

    result['contracts'] = {
        k: {
            'enrollment': int(v['enrollment']),
            'parent_org': v['parent_org'],
            'organization': v.get('organization', v['parent_org']),
            'plan_type': v['plan_type'],
        }
        for k, v in contract_info.items()
    }

    return result


def calculate_changes(current: dict, december: dict) -> dict:
    """
    Calculate enrollment changes between current and December baseline.
    """
    changes = {
        'counties': {},
        'by_org': {},
        'by_state': {},
        'summary': {
            'total_current': current['metadata']['total_enrollment'],
            'total_december': december['metadata']['total_enrollment'],
            'total_change': current['metadata']['total_enrollment'] - december['metadata']['total_enrollment'],
            'total_change_pct': 0,
        }
    }

    if december['metadata']['total_enrollment'] > 0:
        changes['summary']['total_change_pct'] = round(
            (changes['summary']['total_change'] / december['metadata']['total_enrollment']) * 100, 2
        )

    # County changes
    for fips, current_county in current['counties'].items():
        dec_county = december['counties'].get(fips, {'total': 0})
        dec_total = dec_county.get('total', 0)
        curr_total = current_county['total']

        change = curr_total - dec_total
        change_pct = round((change / dec_total * 100), 2) if dec_total > 0 else 0

        changes['counties'][fips] = {
            'current': curr_total,
            'december': dec_total,
            'change': change,
            'change_pct': change_pct,
        }

    # Org changes
    for org, curr_total in current['by_org'].items():
        dec_total = december['by_org'].get(org, 0)
        change = curr_total - dec_total
        change_pct = round((change / dec_total * 100), 2) if dec_total > 0 else 0

        changes['by_org'][org] = {
            'current': curr_total,
            'december': dec_total,
            'change': change,
            'change_pct': change_pct,
        }

    # State changes
    for state, curr_total in current['by_state'].items():
        dec_total = december['by_state'].get(state, 0)
        change = curr_total - dec_total
        change_pct = round((change / dec_total * 100), 2) if dec_total > 0 else 0

        changes['by_state'][state] = {
            'current': curr_total,
            'december': dec_total,
            'change': change,
            'change_pct': change_pct,
        }

    return changes


def save_json(data: dict, output_path: Path):
    """Save data to JSON file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Saved: {output_path}")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Process CMS CPSC enrollment data"
    )
    parser.add_argument(
        "csv_file", type=Path, nargs='?',
        help="Input CSV file (default: most recent in data/raw/)"
    )
    parser.add_argument(
        "--save-december", action="store_true",
        help="Save this data as the December baseline"
    )
    parser.add_argument(
        "--output-dir", type=Path, default=PROCESSED_DIR,
        help="Output directory for JSON files"
    )

    args = parser.parse_args()

    # Find input CSV
    if args.csv_file:
        csv_path = args.csv_file
    else:
        # Find most recent CSV in raw directory
        csv_files = list(RAW_DIR.glob("*.csv"))
        if not csv_files:
            print("No CSV files found in data/raw/")
            print("Run fetch_cms_data.py first to download data.")
            return 1

        csv_path = max(csv_files, key=lambda p: p.stat().st_mtime)
        print(f"Using most recent CSV: {csv_path}")

    if not csv_path.exists():
        print(f"CSV file not found: {csv_path}")
        return 1

    # Process the CSV
    df = process_csv(csv_path)
    enrollment_data = aggregate_enrollment(df)

    # Save current enrollment
    current_path = args.output_dir / "enrollment-current.json"
    save_json(enrollment_data, current_path)

    # Save as December baseline if requested
    if args.save_december:
        december_path = args.output_dir / "enrollment-december.json"
        save_json(enrollment_data, december_path)
        print("Saved as December baseline")

    # Calculate changes if December baseline exists
    december_path = args.output_dir / "enrollment-december.json"
    if december_path.exists():
        with open(december_path) as f:
            december_data = json.load(f)

        changes = calculate_changes(enrollment_data, december_data)
        changes_path = args.output_dir / "enrollment-changes.json"
        save_json(changes, changes_path)

    # Save contracts mapping
    contracts_path = args.output_dir / "contracts.json"
    save_json(enrollment_data['contracts'], contracts_path)

    print("\nProcessing complete!")
    print(f"  Total records: {enrollment_data['metadata']['record_count']:,}")
    print(f"  Total enrollment: {enrollment_data['metadata']['total_enrollment']:,}")
    print(f"  Counties: {len(enrollment_data['counties']):,}")
    print(f"  Organizations: {len(enrollment_data['by_org'])}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
