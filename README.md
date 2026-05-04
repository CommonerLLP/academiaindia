# Whose University?

A public-interest tracker of academic work in India.

**Live site:** [whoseuniversity.org](https://whoseuniversity.org/)

The site has two registers running in parallel:

- **Vacancies.** A live feed of advertised faculty, visiting, and
  postdoctoral positions across Central Universities, the IITs, IIMs,
  NITs, IIITs, AIIMS, and major private universities. Scraped from
  each institution's career page, occasionally PDF-parsed from
  notification documents, and (rarely) hand-transcribed from
  recruitment cards circulated outside the institutions' own websites.
  Every listing carries a provenance grade and a reservation row that
  names what the institution has — and has not — disclosed.

- **The Gap.** A research treatment of the parliamentary record on
  faculty vacancy in centrally-funded higher-education institutions
  from September 2020 to March 2026. 546 questions tabled across the
  Lok Sabha and Rajya Sabha; one question (RS Q.365 of 23 July 2025,
  asked by the Leader of Opposition) surfaced rank-by-category vacancy
  data; the rest were answered with cumulative "Mission Mode" recruitment
  counters that conflate appointment with vacancy. The Gap names this
  substitution and the institutions that perform it.

The full project framing, methodology, disclaimers, and citation are
on the [About page](https://whoseuniversity.org/#about).

## How it's built

```
   docs/data/institutions_registry.json   ← the registry of ~185 institutions
              │
              ▼
   ┌─────────────────────┐
   │   scraper/run.py    │   per-site parsers in scraper/parsers/, an HTTP
   │   (orchestrator)    │   cache, an SSRF guard, a daily archive snapshot
   └──────────┬──────────┘
              ▼
   docs/data/current.json         ←  GitHub Pages serves this
   docs/data/coverage_report.json    directly to the static SPA
   docs/data/archive/YYYY-MM-DD.json
              │
              ▼
   docs/index.html  +  docs/styles.css  +  docs/app.js   ← the SPA
              │
              ▼
   whoseuniversity.org  (GitHub Pages)
```

The whole site is static. There is no backend, no database, no auth,
no user accounts, no analytics. The scraper writes JSON; GitHub Pages
serves JSON; the browser renders JSON.

## Running it locally

The Makefile is the canonical entry point.

```bash
# install pinned dependencies
make deps

# scrape all institutions in the registry, write to docs/data/
make scrape

# scrape a 5-institution smoke test
make scrape ARGS='--limit 5'

# wipe the PDF cache before scraping (for ads that were updated upstream)
make scrape-fresh

# run the test suite (119 tests)
make test

# serve docs/ locally for development
make serve   # → http://localhost:8766/

# apply 30-day retention to docs/data/archive/
make prune-archive
```

The scraper writes its output to `docs/data/`, which is what GitHub
Pages serves; there is no copy step. The [daily-sweep
workflow](.github/workflows/daily-sweep.yml) runs the same `make scrape`
on a GitHub Actions cron at 03:30 IST and commits the diff back to
`main`.

## Repository layout

```
whoseuniversity/
├── docs/                ← what GitHub Pages serves
│   ├── index.html       ← markup + theme-flash script
│   ├── styles.css       ← all stylesheets
│   ├── app.js           ← all SPA logic
│   ├── favicon.svg      ← oxblood "?" mark
│   ├── og.svg / og.png  ← social-share card
│   ├── ARCHITECTURE.md  ← scraper-pipeline architecture
│   └── data/
│       ├── current.json              ← live listings (the SPA reads this)
│       ├── coverage_report.json      ← which parsers worked
│       ├── institutions_registry.json
│       └── vacancy_snapshots.json    ← the parliamentary corpus's structured data
│
├── scraper/             ← Python; runs locally or on Actions
│   ├── run.py           ← orchestrator
│   ├── schema.py        ← Pydantic JobAd / Institution / enums
│   ├── ad_factory.py    ← canonical JobAd builder + stable_id
│   ├── url_safety.py    ← shared SSRF guard (33 unit tests)
│   ├── fetch.py         ← HTTP layer with cache
│   ├── pdf_extractor.py ← PDF → text
│   ├── prune_archive.py ← retention helper
│   └── parsers/         ← one file per institution / institution-family
│
├── scripts/             ← analytical helpers
├── .github/workflows/   ← daily-sweep CI
├── Makefile             ← entry points
├── requirements.txt     ← pinned
├── TECHDEBT.md          ← what's done; what's deferred and why
├── CONTRIBUTING.md      ← parser contract + contribution priorities
└── README.md            ← this file
```

The parliamentary PDFs that drive *The Gap* and the OCR text extracts
of those PDFs **are not in this repository**. They are public records
on `sansad.in` (Lok Sabha at `elibrary.sansad.in`, Rajya Sabha at
`rsdoc.nic.in`); the analysis is open and the bibliography on The Gap
links each chart to its source. If you want the consolidated corpus
for your own research, write to the maintainer.

## Contributing

The site grows by adding institutions. The fastest way to contribute is
to add or fix a parser for an institution that's not yet covered.

Two contribution areas are especially urgent:

1. **Central Universities via Samarth (`curec.samarth.ac.in`).** Most
   Central Universities have moved their recruitment listings onto the
   Samarth eGov public-search portal. Coverage of Central Universities
   in this tracker is currently thin because each university's site
   doesn't always carry the listing — Samarth does. A parser that hits
   `curec.samarth.ac.in` and returns one `JobAd` per public listing
   would unblock dozens of institutions in one shot.

2. **State-government universities.** The site currently covers
   centrally-funded HEIs (CUs, IITs, IIMs, NITs, IIITs, AIIMS) and a
   handful of major private universities. State-government universities
   — Andhra University, Anna University, Calcutta University, Jadavpur
   University, University of Madras, Mumbai University, etc. — are
   absent. They serve far more students than the central system does
   and are systematically excluded from the parliamentary disclosure
   regime The Gap analyses, which makes their hiring practices
   doubly opaque. Adding state universities expands the site's reach
   substantially.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the parser contract,
testing setup, and a priority queue.

## Editorial line

The site reads as journalism, not as a service. The political register
— anti-caste, evidence-grounded, naming institutions by name — is
deliberate. Pull requests that soften analysis, generalise to
"stakeholders" or "marginalised communities" instead of naming SC, ST,
OBC, EWS, PwBD, and Bahujan candidates specifically, or that try to
balance The Gap's claims by adding institutional-perspective
disclaimers that aren't sourced — will be declined.

## Licence

- **Code**: MIT.
- **Data and corpus**: Creative Commons Attribution-ShareAlike 4.0
  International (CC BY-SA 4.0). Cite as: *Whose University?,
  whoseuniversity.org, accessed YYYY-MM-DD.*
