# Changelog

This file is append-only. Entries record public project changes that are
too detailed for the README but useful for maintainers, reviewers, and
future contributors.

## 2026-05-08 — UI Redesign & Article 16 Palette

The listing card UI has been redesigned to improve scannability and accessibility. 
- **Typography & Hierarchy**: Increased institution font size to 28px and adjusted line-heights to establish a clearer visual order. The listings column is now capped at 740px to improve line length for readability.
- **Article 16 Palette**: Shifted the reservation status pill to a high-contrast color register:
    - **Blue**: Confirmed roster disclosure or Special Recruitment Drive (SRD).
    - **Saffron**: Institutional exclusion / No reservation (Private Universities).
    - **Grey**: Unclear or undisclosed status.
- **Accessibility**: Increased tap areas for the star/save buttons (WCAG 2.5.5 AA) and re-anchored footer popovers to prevent viewport overflow.

## 2026-05-08 — `sansad-semantic-crawler` bumped to v0.4.0

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

## 2026-05-06 — `sansad-semantic-crawler` bumped to v0.2.0

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

## 2026-05-06 — Parliamentary-corpus crawler extracted and externalised

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

## 2026-05-06 — Test counts + repo-layout refresh

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

## 2026-05-06 — Project relicensed to non-commercial terms

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

## 2026-05-05 — Phase 2 frontend refactor

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
