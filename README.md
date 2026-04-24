# India HEI Job Tracker

A tracker for faculty advertisements at India's centrally-funded higher-education institutions — scoped to positions Bablu would actually apply for (Humanities & Social Sciences; STS / Technology-in-Society; Development Studies; Sociology / Social Anthropology; Information-and-Society). Central Universities, IITs (HSS departments), IIMs, IISERs, IISc, NITs (HSS), IIITs (HCD / Cognitive / Human Sciences). AIIMS is out of scope (medical/allied-health).

## How you use this

Two input paths, same output.

### Path A — Drop a PDF you already have

When you download a rolling advertisement or an institution-specific PDF (e.g. IIT Delhi's AP-1 2026 PDF), run:

```bash
python scraper/ingest_pdf.py \
    --pdf sources/iit-delhi/IITD_2026_AP-1_2026-04-23.pdf \
    --institution iit-delhi \
    --merge
```

`--merge` appends to `data/current.json` and dedupes on `ad_id`. Drop `--merge` to replace. Add `--dry-run` to preview without writing.

The IITD extractor splits one rolling advertisement into twenty-five records: one per engineering / management / centre department, and — for the Department of Humanities & Social Sciences — one record per declared sub-area (Economics, Literature, Technology-in-Society, Sociology, Psychology). This is what a PhD application actually targets; the institutional unit is misleading.

For institutions without a dedicated extractor, the generic path returns one record per PDF with best-effort metadata. Add institution-specific extractors in `scraper/ingest_pdf.py` (see `_extract_iitd_rolling_ap` as the template).

### Path B — Live-scrape from your laptop

**The Cowork environment cannot reach Indian HEI domains** (egress proxy blocks every `*.ac.in`, `*.nic.in`, `*.edu.in`, `*.samarth.ac.in` host we tried on 23 April 2026). Running `scraper/run.py` from inside Cowork will return zero records. Run it on your laptop instead:

```bash
# On your laptop (not in Cowork)
cd ~/Library/Mobile\ Documents/.../adp/india-hei-job-tracker   # or wherever the folder is synced
pip install pdfplumber pydantic requests requests-cache beautifulsoup4

# Fetch + parse every institution in the registry
python scraper/run.py

# Or test-run against first N institutions
python scraper/run.py --limit 10
```

Output: `data/current.json` (latest snapshot), `data/archive/YYYY-MM-DD.json` (daily history), `data/coverage_report.json` (which parsers worked, which didn't).

### Path C — Automated daily sweep via GitHub Actions (recommended)

The workflow is checked in at `.github/workflows/daily-sweep.yml`. It runs `scraper/run.py` every day at 03:30 IST on GitHub-hosted Ubuntu runners (which have unblocked outbound internet — Cowork's sandbox does not), commits the updated `data/` back to `main`, and uploads a coverage report. Full setup instructions in `docs/github-actions-setup.md` — about 10 minutes of one-time config:

```bash
# On your laptop, in the india-hei-job-tracker folder
git init -b main
git add -A
git commit -m "initial commit"
gh repo create india-hei-job-tracker --private --source=. --push
```

Then trigger the first run manually from the Actions tab on GitHub (Actions → daily-sweep → Run workflow), or wait for the cron at 22:00 UTC. Sync fresh `data/current.json` to your laptop with `git pull`; Cowork picks it up on the next artifact regeneration.

Zero ongoing cost (well under the GitHub Actions free tier) and no account of yours touches `.ac.in` — the GitHub runner does.

## Viewing the output

The Cowork artifact (`india-hei-job-tracker`) reads `data/current.json` at artifact-update time. After you run ingest or the scraper, re-generate the artifact via Claude's `update_artifact` tool to see the fresh listings. No auto-refresh — the artifact is a frozen reading.

Alternatively, for a pure-local view, open `dashboard/index.html` in a browser served from the project root:

```bash
python -m http.server 8000
# → http://localhost:8000/dashboard/
```

## Discipline scope — HSS only

The current Cowork artifact filters by keyword against each ad's title + department + raw_text_excerpt. Three tri-state classes:

- **HSS match** — keyword hit for sociology / anthropology / dev studies / STS / public policy / political science / gender studies / media studies / history / philosophy / economics / linguistics / cognitive science / human sciences / dept codes (HSS, HUSS, SSL, HCD).
- **Ambiguous** — generic "Faculty" ads where the discipline is not disclosed in parsed text. Default view includes these so you don't miss umbrella calls that may include HSS.
- **Out-of-scope** — non-teaching staff, engineering-specific, medical/allied-health. Hidden by default.

Widen or narrow via the radio buttons in the Live listings tab.

## Repository layout

```
india-hei-job-tracker/
├── docs/
│   ├── CRITIQUE.md         ← historical framing (superseded by README for operational instructions)
│   └── ARCHITECTURE.md     ← system design (if present)
├── scraper/
│   ├── schema.py           ← Pydantic models (Institution, JobAd, enums)
│   ├── fetch.py            ← HTTP layer (used by run.py; runs only on your laptop)
│   ├── run.py              ← live-scrape orchestrator (laptop-side)
│   ├── ingest_pdf.py       ← PDF → JobAd records (runs anywhere, no network)
│   ├── build_registry.py   ← regenerates institutions_registry.xlsx + .json
│   ├── verify_registry.py  ← probes URLs (laptop-side)
│   └── parsers/
│       ├── generic.py      ← heuristic HTML fallback
│       ├── iit_delhi.py    ← IITD jobs page (HTML; for run.py)
│       └── jnu.py          ← JNU recruitment page (HTML; for run.py)
├── sources/                ← PDFs you've downloaded, one folder per institution
│   └── iit-delhi/
│       └── IITD_2026_AP-1_2026-04-23.pdf
├── inbox/                  ← drop zone for new PDFs before classification
├── dashboard/
│   └── index.html          ← single-file static dashboard (optional view)
├── data/
│   ├── institutions_registry.json  (registry; AIIMS removed)
│   ├── current.json        ← live listings (produced by ingest_pdf or run.py)
│   ├── coverage_report.json
│   └── archive/YYYY-MM-DD.json
└── README.md
```

## Sanity checks before trusting a listing

- Every record carries `original_url` — a `file://` path if from a PDF you dropped, or an `https://` URL if from the live scraper. Click through and verify against the canonical source before acting.
- `parse_confidence` is a self-report from the extractor. IITD-specific PDF extractor returns ≥ 0.88 for top-level departments and 0.92 for HSS sub-areas. The generic HTML fallback returns 0.35. Anything below 0.4 should be treated as a pointer, not a summary.
- `claimed_deadline` is what the extractor pulled from the document. Indian institutional deadlines shift. Verify.

## Legal posture (unchanged)

Rate-limited (1 req / 10 s / domain) when run live. Identified `User-Agent`. Respects `robots.txt`. Caches aggressively. DPDP Act 2023: no personal data collected. Does not touch `admin.samarth.ac.in` (authenticated ERP) without permission. `curec.samarth.ac.in` (public search portal) is in-scope but currently unreachable from both our environments.

## License

Code: MIT. Data: CC-BY 4.0 with attribution to the institutions whose advertisements are indexed.
