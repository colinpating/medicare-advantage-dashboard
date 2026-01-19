# Medicare Advantage Enrollment Dashboard

Interactive web dashboard for tracking Medicare Advantage market share by state and county, with filtering by parent organization, contract, and plan type.

## Features

- **Interactive Map**: Leaflet.js choropleth visualization of US counties
- **Multiple Views**: Total enrollment, change from December, or % change
- **Filters**: Parent organization, contract number, plan type (DSNP, HMO, PPO, PFFS)
- **December Baseline**: Compare current enrollment to December baseline
- **Rankings**: Top 5 gainers and losers by county
- **Organization Breakdown**: Market share by parent organization

## Quick Start

### Local Development

1. Open `src/index.html` in a web browser
2. The dashboard will load sample data from `data/processed/`

Note: Due to CORS restrictions, you may need to serve the files via a local server:

```bash
# Python 3
cd medicare-advantage-dashboard
python -m http.server 8000

# Then open http://localhost:8000/src/index.html
```

### Fetch Real CMS Data

1. Install Python dependencies:
   ```bash
   pip install -r scripts/requirements.txt
   ```

2. Fetch the latest CMS data:
   ```bash
   python scripts/fetch_cms_data.py
   ```

3. Process the enrollment data:
   ```bash
   python scripts/process_enrollment.py
   ```

4. To save as December baseline (run in January or manually):
   ```bash
   python scripts/process_enrollment.py --save-december
   ```

## Project Structure

```
medicare-advantage-dashboard/
├── .github/workflows/
│   └── update-data.yml        # Monthly auto-fetch via GitHub Actions
├── data/
│   ├── processed/             # JSON files for dashboard
│   │   ├── enrollment-current.json
│   │   ├── enrollment-december.json
│   │   ├── enrollment-changes.json
│   │   └── contracts.json
│   └── raw/                   # Downloaded CSV files (gitignored)
├── scripts/
│   ├── fetch_cms_data.py      # Download CMS ZIP files
│   ├── process_enrollment.py  # CSV → JSON processing
│   └── requirements.txt
├── src/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js             # Main controller
│       ├── map.js             # Leaflet choropleth
│       ├── filters.js         # Filter UI logic
│       ├── data-loader.js     # JSON fetching
│       └── utils.js           # Helper functions
└── vercel.json                # Deployment config
```

## Data Source

Data comes from CMS Monthly Enrollment by CPSC (Contract/Plan/State/County):
https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data/monthly-enrollment-contract/plan/state/county

Released approximately the 15th of each month.

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Vercel will auto-deploy on push to main branch
3. The `vercel.json` configuration handles routing

### GitHub Actions

The workflow runs automatically on the 18th of each month to:
1. Fetch the latest CMS data
2. Process enrollment numbers
3. Auto-save December baseline in January
4. Commit updated JSON files
5. Trigger Vercel deployment

Manual trigger available with option to force December baseline save.

## Plan Type Identification

| Contract Prefix | Type |
|----------------|------|
| H | HMO/Local MA |
| R | Regional PPO |
| S | Stand-alone PDP |
| E | Employer Group |

DSNP plans identified via organization type field or keywords in plan name.

## Notes

- CMS masks enrollment values <11 for privacy (shown as 0)
- Data has ~1 month lag from CMS processing
- County boundaries from US Atlas TopoJSON (~400KB)
