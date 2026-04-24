# Architecture — India HEI Job Tracker

## One-line summary

A batch-polling scraper reads a curated registry of institution career pages, writes normalised advertisement records to a versioned JSON archive, and a static HTML dashboard renders the current feed with filters. The archive is the durable public good; the dashboard is a replaceable surface.

## Why this shape

Three constraints drive the architecture:

- **No persistent server.** The project must run on a schedule (GitHub Actions, self-hosted cron, or run-on-demand) and produce static artefacts. This rules out live databases, authenticated APIs, user accounts.
- **Heterogeneous sources.** ~185 institutions, no shared schema, mix of HTML pages / PDF-only / Samarth-redirect / JS-rendered. Per-site parsers are unavoidable; graceful-degradation is mandatory.
- **Maintainability over elegance.** This will be maintained by a solo researcher or a small volunteer group, not a team. Every design choice prefers fewer moving parts over clean abstractions.

## Component diagram

```
   registry.xlsx  ──►  normalise_registry.py  ──►  registry.json
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │    run.py       │
                                               │  (orchestrator) │
                                               └────────┬────────┘
                                                        │
               ┌────────────────────────────────────────┼────────────────────┐
               ▼                                        ▼                    ▼
         fetch.py                              parsers/<site>.py      parsers/generic.py
       (HTTP + cache)                          (site-specific)        (heuristic fallback)
               │                                        │                    │
               └────────────────────────────────────────┼────────────────────┘
                                                        ▼
                                                 JobAd records
                                                        │
                                                        ▼
                                          data/current.json  +  data/archive/YYYY-MM-DD.json
                                                        │
                                                        ▼
                                            dashboard/index.html
                                             (reads current.json)
```

## Data model

`schema.py` defines two Pydantic models:

**Institution** (from registry)
- `id` — slug, e.g. `iit-delhi`, `jnu`, `aiims-delhi`
- `name` — canonical long form
- `short_name`
- `type` — enum: IIT | IIM | IISER | IISc | CentralUniversity | NIT | IIIT | AIIMS | Other
- `state`
- `city`
- `established` — year
- `statute_basis` — enum: IITAct1961 | IIMAct2017 | NITAct2007 | UGCAct1956 | CentralUnivsAct2009 | IIIAct2014 | Individual
- `career_page_urls` — list (many sites have multiple)
- `ad_format` — enum: HTML | PDFOnly | Samarth | Mixed | Unknown
- `parser` — module name (e.g. `parsers.iit_delhi`) or `generic`
- `last_verified` — ISO date; null if never verified
- `coverage_status` — enum: Active | Stub | Broken | SamarthOnly | Unverified
- `notes` — free text (manual)

**JobAd** (scraped output)
- `id` — stable hash of (institution_id, ad_number or title, publication_date)
- `institution_id` — FK
- `ad_number` — official reference code when present
- `title` — post title as advertised
- `department` — string (nullable)
- `discipline` — string (nullable)
- `post_type` — enum: Faculty | NonFaculty | Scientific | Administrative | Research | Contract | Unknown
- `contract_status` — enum: Regular | TenureTrack | Contractual | Guest | AdHoc | Visiting | TFPP | TTAP | Unknown
- `category_breakdown` — dict {UR, SC, ST, OBC, EWS, PwBD} with int counts or nulls
- `number_of_posts` — int (total across categories)
- `pay_scale` — string (7th CPC Academic Level XX / Level XX)
- `publication_date` — ISO date
- `closing_date` — ISO date; nullable; flagged_as_authoritative = False always
- `original_url` — canonical URL to PDF/HTML
- `snapshot_fetched_at` — ISO datetime (UTC)
- `parse_confidence` — float 0.0–1.0 (parser self-reports)
- `raw_text_excerpt` — first 500 chars of source for audit

## Parser contract

Each `parsers/<site>.py` exports a single function:

```python
def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]
```

No side effects. Throws `ParseError` on unrecoverable failure. Returns empty list if page has no ads. A parser self-reports `parse_confidence` based on how many fields it was able to extract with structural certainty (URL from a link element → high) vs. heuristic regex (closing date from free-text → low).

The `generic` fallback is a rule-based extractor that looks for patterns common across Indian HEI sites: "Advertisement No. ...", "closing date: ...", "No. of posts: ...", PDFs linked with text containing "recruitment"/"faculty"/"non-teaching"/"वेत"/"भर्ती" etc. It returns lower-confidence records.

## Fetch layer

`fetch.py` handles:

- `User-Agent: india-hei-job-tracker/0.1 (+mailto:solanki.aakash@gmail.com)`
- Per-domain rate limit (default 1 req / 10s, configurable per institution)
- HTTP caching via `requests-cache` with 6-hour TTL
- Retry on 5xx with exponential backoff (max 3 attempts, 30s cap)
- 4xx is fatal (record error, move on)
- Respect `robots.txt` via `urllib.robotparser`
- Optional Playwright path for JS-rendered pages (NIT-some, some AIIMSs)

## Orchestration

`run.py` iterates over `registry.json`, dispatches each institution to its parser, aggregates results into `data/current.json`, and snapshots a dated copy into `data/archive/YYYY-MM-DD.json`. A per-run `coverage_report.json` records:
- institutions_attempted
- institutions_succeeded
- institutions_failed (with error class)
- ads_found_total
- ads_new_vs_previous_run
- parsers_with_zero_results (suspect breakage)

This report is surfaced in the dashboard's coverage tab.

## Deployment (documented, not built in v1)

Preferred: **GitHub Actions** on a daily cron that runs `run.py`, commits the updated `data/` and `dashboard/` to a `gh-pages` branch, publishes via GitHub Pages. Zero infrastructure cost. Public audit log of every fetch via commit history.

Alternative: self-hosted cron → S3 / Cloudflare Pages.

## What v1 ships

- Registry with 150+ institutions, all flagged `coverage_status: Unverified` except the ~10 that have working parsers.
- Fetch + orchestration layer: working.
- Parsers: IIT-Delhi, JNU, two more as proof-of-concept. Placeholder stubs for the rest.
- Generic parser: working, low-confidence output.
- Dashboard: static HTML reading from `data/current.json`, with institution/type/category filters and a coverage tab.
- Docs: CRITIQUE, ARCHITECTURE, README, CONTRIBUTING (parser contribution guide).

## What v1 explicitly does not ship

- Email/RSS notifications.
- User accounts.
- Samarth scraping (forbidden).
- State University support.
- Historical backfill from Wayback (separate project; see CRITIQUE.md "publication possibility").
- Aggregate statistics dashboard. Coverage reporting only.
