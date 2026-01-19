#!/usr/bin/env python3
"""
Fetch CMS Monthly Enrollment by CPSC data.

Downloads the monthly ZIP file from CMS containing enrollment data
by Contract/Plan/State/County.
"""

import os
import re
import sys
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

import requests

# CMS data page URL
CMS_DATA_PAGE = "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/monthly-enrollment-contract/plan/state/county"

# Direct download pattern - CMS hosts files with varying naming conventions
# Example: CPSC_Enrollment_Info_2024_01.zip
CMS_DOWNLOAD_BASE = "https://www.cms.gov/files/zip"

# Data directory
DATA_DIR = Path(__file__).parent.parent / "data"
RAW_DIR = DATA_DIR / "raw"


def get_current_data_month():
    """
    Determine the most recent available data month.
    CMS releases data around the 15th of each month for the prior month.
    """
    today = datetime.now()
    # If before the 15th, use data from 2 months ago; otherwise, 1 month ago
    if today.day < 15:
        month_offset = 2
    else:
        month_offset = 1

    # Calculate the data month
    data_month = today.month - month_offset
    data_year = today.year
    if data_month <= 0:
        data_month += 12
        data_year -= 1

    return data_year, data_month


def fetch_cpsc_data(year: int, month: int, output_dir: Path = None) -> Path:
    """
    Fetch the CPSC enrollment data for a given month.

    Args:
        year: Data year (e.g., 2024)
        month: Data month (1-12)
        output_dir: Directory to save the extracted CSV

    Returns:
        Path to the extracted CSV file
    """
    if output_dir is None:
        output_dir = RAW_DIR

    output_dir.mkdir(parents=True, exist_ok=True)

    # Month names for URL
    month_names = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ]
    month_name = month_names[month - 1]

    # Try various file naming conventions CMS has used
    month_str = f"{month:02d}"
    possible_filenames = [
        f"monthly-enrollment-cpsc-{month_name}-{year}.zip",
        f"monthly-enrollment-by-cpsc-{month_name}-{year}.zip",
        f"CPSC_Enrollment_Info_{year}_{month_str}.zip",
        f"CPSC-Enrollment-Info-{year}-{month_str}.zip",
        f"cpsc-enrollment-{year}-{month_str}.zip",
        f"Monthly_Report_By_CPSC_{year}_{month_str}.zip",
    ]

    zip_data = None
    successful_url = None

    for filename in possible_filenames:
        url = f"{CMS_DOWNLOAD_BASE}/{filename}"
        print(f"Trying: {url}")

        try:
            response = requests.get(url, timeout=60)
            if response.status_code == 200:
                zip_data = response.content
                successful_url = url
                print(f"Successfully downloaded from: {url}")
                break
        except requests.RequestException as e:
            print(f"  Failed: {e}")
            continue

    if zip_data is None:
        # Try fetching the page to find the actual download link
        print(f"Direct downloads failed. Attempting to parse CMS page...")
        zip_data, successful_url = fetch_from_cms_page(year, month)

    if zip_data is None:
        raise RuntimeError(
            f"Could not find CPSC data for {year}-{month_str}. "
            "The file may not be available yet or the URL format has changed."
        )

    # Extract the ZIP file
    csv_path = extract_zip(zip_data, output_dir, year, month)
    return csv_path


def fetch_from_cms_page(year: int, month: int):
    """
    Attempt to find and download the data file by parsing the CMS page.

    Returns:
        Tuple of (zip_data bytes, url) or (None, None) if not found
    """
    try:
        response = requests.get(CMS_DATA_PAGE, timeout=30)
        response.raise_for_status()

        # Look for ZIP file links in the page
        # CMS uses various patterns for hosting files
        patterns = [
            rf'href=["\']([^"\']*{year}[^"\']*{month:02d}[^"\']*\.zip)["\']',
            rf'href=["\']([^"\']*cpsc[^"\']*{year}[^"\']*\.zip)["\']',
        ]

        for pattern in patterns:
            matches = re.findall(pattern, response.text, re.IGNORECASE)
            for match in matches:
                # Construct full URL if relative
                if match.startswith('/'):
                    url = f"https://www.cms.gov{match}"
                elif not match.startswith('http'):
                    url = f"https://www.cms.gov/{match}"
                else:
                    url = match

                print(f"Found potential link: {url}")
                try:
                    zip_response = requests.get(url, timeout=60)
                    if zip_response.status_code == 200:
                        return zip_response.content, url
                except requests.RequestException:
                    continue

    except requests.RequestException as e:
        print(f"Could not fetch CMS page: {e}")

    return None, None


def extract_zip(zip_data: bytes, output_dir: Path, year: int, month: int) -> Path:
    """
    Extract the CSV files from the ZIP file.

    Returns:
        Path to the extracted enrollment CSV file
    """
    with zipfile.ZipFile(BytesIO(zip_data)) as zf:
        # Find CSV files in the archive
        csv_files = [f for f in zf.namelist() if f.lower().endswith('.csv')]

        if not csv_files:
            raise RuntimeError("No CSV files found in the downloaded ZIP")

        # Find enrollment and contract info files
        enrollment_file = None
        contract_file = None

        for f in csv_files:
            f_lower = f.lower()
            if 'enrollment' in f_lower and 'contract_info' not in f_lower:
                enrollment_file = f
            elif 'contract' in f_lower and 'info' in f_lower:
                contract_file = f

        # If no enrollment-specific file found, use the largest CSV
        if enrollment_file is None:
            file_sizes = [(f, zf.getinfo(f).file_size) for f in csv_files]
            file_sizes.sort(key=lambda x: x[1], reverse=True)
            enrollment_file = file_sizes[0][0]

        # Extract enrollment file
        print(f"Extracting: {enrollment_file}")
        output_filename = f"cpsc_enrollment_{year}_{month:02d}.csv"
        output_path = output_dir / output_filename

        with zf.open(enrollment_file) as src, open(output_path, 'wb') as dst:
            dst.write(src.read())
        print(f"Saved to: {output_path}")

        # Extract contract info file if found
        if contract_file:
            print(f"Extracting: {contract_file}")
            contract_output = output_dir / f"cpsc_contract_info_{year}_{month:02d}.csv"
            with zf.open(contract_file) as src, open(contract_output, 'wb') as dst:
                dst.write(src.read())
            print(f"Saved to: {contract_output}")

        return output_path


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Fetch CMS CPSC enrollment data"
    )
    parser.add_argument(
        "--year", type=int,
        help="Data year (default: auto-detect)"
    )
    parser.add_argument(
        "--month", type=int,
        help="Data month (default: auto-detect)"
    )
    parser.add_argument(
        "--output-dir", type=Path,
        help="Output directory for extracted CSV"
    )

    args = parser.parse_args()

    if args.year and args.month:
        year, month = args.year, args.month
    else:
        year, month = get_current_data_month()
        print(f"Auto-detected data month: {year}-{month:02d}")

    try:
        csv_path = fetch_cpsc_data(year, month, args.output_dir)
        print(f"\nSuccess! CSV saved to: {csv_path}")
        return 0
    except Exception as e:
        print(f"\nError: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
