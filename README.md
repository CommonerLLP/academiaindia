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

# run the Python test suite (153 tests + 9 skipped)
make test

# run the frontend Vitest suite (117 tests across 11 files)
npm test

# serve docs/ locally for development
make serve   # → http://localhost:8766/

# apply 30-day retention to docs/data/archive/
make prune-archive
```

The scraper writes its output to `docs/data/`, which is what GitHub
Pages serves; there is no copy step. The [weekly-sweep
workflow](.github/workflows/weekly-sweep.yml) runs the same `make scrape`
on a GitHub Actions cron at 03:30 IST every Monday, validates
`docs/data/current.json`, and opens a data-update PR instead of pushing
directly to `main`.

## Repository layout

```
whoseuniversity/
├── docs/                ← what GitHub Pages serves
│   ├── index.html       ← markup + theme-flash script
│   ├── styles.css       ← all stylesheets
│   ├── app.js           ← all SPA logic
│   ├── lib/             ← ESM modules; the SPA's logic lives here
│   ├── favicon.svg      ← oxblood "?" mark
│   ├── og.svg / og.png  ← social-share card
│   ├── ARCHITECTURE.md  ← scraper-pipeline architecture
│   ├── PARSER-ARCHITECTURE.md  ← parser-pipeline design doc
│   ├── MISTAKES.md      ← append-only log of parser/UI failures
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
├── .github/workflows/   ← weekly-sweep CI
├── Makefile             ← entry points
├── requirements.txt     ← pinned
├── package.json         ← Vitest dev-tooling only; the site ships zero npm packages
├── tests/               ← Vitest suite for `docs/lib/` modules
├── CONTRIBUTING.md      ← parser contract + contribution priorities
├── LICENSE              ← PolyForm Noncommercial 1.0.0
├── CITATION.cff         ← machine-readable citation metadata
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

This project is **non-commercial source-available**. Both restrictions
matter equally:

- **Code**: [PolyForm Noncommercial
  1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/).
  Source-available and modifiable for research, education, journalism,
  public-interest work, and personal use. Commercial use is not
  permitted under any circumstance.
- **Data and corpus**: [Creative Commons
  Attribution-NonCommercial-ShareAlike 4.0
  International](https://creativecommons.org/licenses/by-nc-sa/4.0/)
  (CC BY-NC-SA 4.0). Free for non-commercial reuse with attribution
  and share-alike. Cite as: *Whose University?,
  whoseuniversity.org, accessed YYYY-MM-DD.*

These are public records of the Indian state, processed and
published as a public-interest research artefact. The licences
ensure they stay that way — no commercial product can be built on
top of this work, by anyone.

A `CITATION.cff` at the repository root carries machine-readable
citation metadata; GitHub renders it as a "Cite this repository"
button.


## Document history

This section is append-only. The body of the README above is preserved
as the original description; each dated entry below records what
changed in the project between then and the entry date.

### 2026-05-08 — `sansad-semantic-crawler` bumped to v0.4.0

`requirements.txt` now pins the upstream crawler at
[`v0.4.0`](https://github.com/CommonerLLP/sansad-semantic-crawler/releases/tag/v0.4.0).
This release automates the **politician enrichment layer**:

- **Automated Party/State Lookup**: Question records now include an `asker_details`
  block (party, party_name, state, house) pulled from the latest official
  member lists. No more manual party-mapping in `consolidate_corpus.py`.
- **Committee Composition Rosters**: The crawler can now fetch the full
  roster of parliamentary standing committees using a hybrid API and
  PDF/LLM strategy. This enables tracking how committee membership
  (and the political balance within) changes from one report to the next.
- **Refactored Base Architecture**: Improved provenance tracking and
  PDF sanity checks.

This bump is **behaviour-preserving**: the single-schema assumption for
questions remains intact, but manifests will now contain richer metadata
by default.

### 2026-05-06 — `sansad-semantic-crawler` bumped to v0.2.0

`requirements.txt` now pins the upstream crawler at
[`v0.2.0`](https://github.com/CommonerLLP/sansad-semantic-crawler/releases/tag/v0.2.0)
(was `v0.1.0`). The new release ships a **pluggable-classifier
architecture** — regex (default, back-compat), embeddings (Sentence
Transformers anchor similarity), LLM (OpenAI-compat chat-completions
JSON tagging), or ensemble (combine modes). Optional pip extras:
`[embeddings]`, `[llm]`, `[all]`. The package never ships model
weights; users supply their own runtime (Ollama, vLLM, llama.cpp,
mlx-lm, transformers, or any OpenAI-compatible hosted service).

This bump is **behaviour-preserving for this project**:
`notes/topics/cei-vacancies.json` does not declare a `classifier`
block, so v0.2.0 transparently falls back to the regex classifier
that drove every Gap chart prior to today. Adopting embeddings or
LLM modes is a separate, opt-in editorial decision.

`make test` (153 + 9 skipped) and `npm test` (126 across 11 files)
unaffected. The bump touches one line in `requirements.txt`.

### 2026-05-06 — Parliamentary-corpus crawler extracted and externalised

The three legacy scripts that built *The Gap*'s parliamentary corpus
— `scripts/sansad_crawl.py` (291 lines), `scripts/sansad_rs_crawl.py`
(215 lines), and `scripts/sansad_download_pdfs.py` (125 lines) — are
**retired**. Their behaviour (LS DSpace API + RS rsdoc.nic.in API +
PDF discovery + dedup-on-resume) now lives in a separately-released
public-good package, **`sansad-semantic-crawler`**, hosted at
[github.com/CommonerLLP/sansad-semantic-crawler](https://github.com/CommonerLLP/sansad-semantic-crawler)
and pinned at `v0.1.0` in `requirements.txt`.

The package is config-driven: it expects a topic-profile JSON that
encodes search groups, ministry filters, and tag rules. The faculty-
vacancy / reservation / Mission-Mode lens that drove the legacy
scripts is now `notes/topics/cei-vacancies.json` — gitignored, since
the analytical lens is project-specific and the public package ships
only a `libraries.json` example for `theright2read`.

What the host project picks up in exchange:

- **One canonical schema for both houses.** The legacy LS manifest
  used `questiontype` / `questionno` / `members`; the legacy RS
  manifest used `qtype` / `qno` / `asker`. The package emits
  `qtype` / `qno` / `askers` directly for both houses.
  `scripts/consolidate_corpus.py` is rewritten to consume that single
  schema, which dropped roughly half its branching logic.
- **Stable `key` field on every record** (`LS|U|178|2024-11-25` /
  `RS|S|365|2025-07-23`), so dedup is no longer a per-script
  computation. This was always how `consolidate_corpus.py`
  internally normalised — it is now a guaranteed property of the
  upstream manifest.
- **Re-usable PDF naming** — the package writes LS PDFs to
  `data/_sansad_crawl/pdfs/ls/` and RS PDFs to
  `.../pdfs/rs/`. Filenames match the legacy convention
  (`{qtype-letter}{qno}_{slug}.pdf`), so existing PDFs can be moved
  into the new tree without re-download if the maintainer chooses
  to skip the full re-crawl.

Operational entry points: `make corpus-refresh` (full pipeline:
crawl → parse → consolidate). See `make help` for the per-step
targets.

### 2026-05-06 — Test counts + repo-layout refresh

The 2026-05-05 entry below describes a frontend test floor of 81 Vitest
tests across 4 files (`sanitize`, `classify`, `excerpt`, `schema`) and
notes that 5 lib modules still lacked coverage. Both numbers are
superseded:

- **Python**: 153 tests + 9 skipped (was 119).
- **Vitest**: 117 tests across 11 files (was 81 across 4).
- 11 of 13 `docs/lib/` modules now have at least smoke / contract
  coverage: `sanitize`, `classify`, `excerpt`, `schema`,
  `current-validator`, `card-helpers`, `render-card`, `filters`,
  `map`, `render-tabs`, `search`. The two without dedicated unit
  tests are `charts.js` (chart data + Resources-tab payload) and
  `state.js` (a thin shared mutable-state holder); both are exercised
  indirectly by the higher-level tests but warrant direct contracts
  next time they're touched.

The Repository-layout block is also updated above to reflect the
public-tree files added since the original was written:
`docs/lib/`, `docs/MISTAKES.md`, `docs/PARSER-ARCHITECTURE.md`,
`LICENSE`, `CITATION.cff`, `package.json`, `tests/`. The orphaned
`TECHDEBT.md` line is removed: that file is part of the maintainer's
private working notes (`/notes/` is gitignored), not the public
tree, so the original layout entry was always pointing at a path
that GitHub never sees.

### 2026-05-06 — Project relicensed to non-commercial terms

The Licence section above is rewritten as of this date. Prior to
2026-05-06 the project shipped under MIT (code) and CC BY-SA 4.0
(data); both permitted commercial use. From 2026-05-06 forward,
the project is non-commercial source-available: PolyForm
Noncommercial 1.0.0 for code, CC BY-NC-SA 4.0 for data and corpus.

The change is not retroactive against existing users — both MIT and
CC BY-SA 4.0 are perpetual for any recipient who exercised rights
under them. New copies of the code and data going forward are
governed by the new terms.

The intent: this work is funded indirectly by the Indian public,
exists to surface a public-interest argument, and should never
become a commercial product — anyone's, including the maintainer's.
The site footer and the colophon disclaimer on every page are
updated to match. A `LICENSE` file with the canonical PolyForm
text and a `CITATION.cff` are added at the repository root.

### 2026-05-05 — Phase 2 frontend refactor

The "Repository layout" block above describes `docs/app.js` as "all
SPA logic" — that was true at the time of writing. As of commit
`2d50c7c`, `app.js` is **728 lines of orchestration only** (imports,
`loadData`, `render()`, tab routing, event wiring); the bulk of the
SPA logic now lives in **9 ESM modules under `docs/lib/`**:

| Module | Purpose |
|---|---|
| `lib/sanitize.js` | `escapeHTML` / `safeUrl` / URL allowlist *(tested)* |
| `lib/schema.js` | Zod schemas for runtime + test-time validation *(tested)* |
| `lib/classify.js` | Field tags / position rank / listing quality *(tested)* |
| `lib/excerpt.js` | `raw_text_excerpt` sanitiser *(tested)* |
| `lib/charts.js` | Vacancies tab + The Gap charts + resources data |
| `lib/state.js` | Shared mutable state holder (`state.ADS`, `state.SAVED`, etc.) |
| `lib/card-helpers.js` | Per-card cue extractors and rank/discipline formatters |
| `lib/render-card.js` | `renderAd()` + hiring-trap detection + card wiring |
| `lib/filters.js` | Filter / sort / search + reactive facet counts |
| `lib/map.js` | Leaflet init + marker updates |
| `lib/render-tabs.js` | Resources / Saved / Coverage tab renderers |

Frontend tests live under `tests/` (Vitest); 81 tests across 4 files
covering `sanitize`, `classify`, `excerpt`, and `schema`. Run with
`npm test`. The remaining 5 lib modules ship without unit tests yet —
backfilling those is deliberate next-step work.

The "Running it locally" `make test` command above runs the 119-test
**Python** scraper suite. Frontend tests run separately via `npm test`.
Both should be green before opening a PR that touches their respective
trees.
