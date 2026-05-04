# Tech-Debt Status

What got addressed in the most recent debt-pass and what's deferred. Refresh
this file when items move.

## Done

| Item | Where it landed |
|---|---|
| Pin dependencies | `requirements.txt` |
| Makefile entry points | `Makefile` (`scrape`, `scrape-fresh`, `serve`, `test`, `prune-archive`, `deps`, `clean`) |
| Replace bare-except with logging | `scraper/pdf_extractor.py` (`logger = logging.getLogger(__name__)`); orchestrator gets a basic `logging.basicConfig` in `scraper/run.py` |
| Hard-coded year floor in `find_deadline` | now `max(HARD_FLOOR_DEADLINE_YEAR, current_year - 1)` |
| `download_pdf` cache TTL | new `max_age_seconds` param, default `PDF_CACHE_TTL_SECONDS = 24h`; `make scrape-fresh` deletes `.cache/pdfs/` to bust |
| Centralized magic numbers + sentinel | `scraper/constants.py` |
| SSRF allowlist | `_is_safe_url` in `scraper/pdf_extractor.py` (refuses non-http(s) and private/loopback IPs) |
| IIT-Kanpur frozen `KNOWN_DEPTS` | now 2-pass: known-name pass + generic `<ProperNoun phrase>:` fallback; unmatched matches log at INFO |
| Pydantic schema drift | `JobAd` declares `model_config = ConfigDict(extra="allow")` and lists the parser-attached optional fields explicitly |
| Single ad-factory | `scraper/ad_factory.make_ad(**kwargs)` available; full migration of every parser deferred (high-risk wholesale change) |
| `run.py` mega-ternary CoverageRow | refactored to explicit if/elif branches in `record_outcome()` |
| Unit tests | 56 tests across `scraper/tests/test_pdf_extractor.py`, `test_iim_recruit.py`, `test_iit_kanpur.py`, `test_run_orchestrator.py`. Run via `make test`. |
| Archive retention helper | `scraper/prune_archive.py` (30 days daily / 52 weeks weekly / quarterly thereafter); `make prune-archive` |
| `fetch.py` cache semantics doc | inline docstring expanded |
| Field-pill dark-mode border | added in `dashboard/index.html` for `[data-theme="dark"]` |
| Dashboard cache-bust on JSON | replaced with `cache: "no-cache"` so 304-conditional reloads work |
| Logo `onerror=` inline → event listener | `wirePortrait()` in `dashboard/index.html` |

## Deferred (with rationale)

These items are real debt, not done in this pass either because they were
out of scope for "code edits to the existing codebase" or because the
remediation would itself be high-risk.

### Dashboard `index.html` (1,200+ lines, single file)

**Status:** documented, not split.
**Why deferred:** splitting into `index.html` + `styles.css` + `app.js`
mid-pass would touch literally every recent edit and meaningfully risk
breaking the layout / theme / tab behaviour. Better as a contained PR with
its own verification cycle.
**When to do it:** when the JS exceeds ~1,500 lines or when multiple people
need to edit it concurrently.

### CI / scheduled scrape automation

**Status:** not added.
**Why deferred:** this is process-side, not code-side. A GitHub Actions
workflow that runs `make scrape && make test` daily and commits the diff is
a 30-line YAML file but lives outside this repo's current operational model
(the user runs scrapes manually). Worth doing if the tracker becomes
a shared resource.
**Sketch:** `.github/workflows/scrape.yml` with `on: schedule: cron: "0 6 * * *"`
+ a `peter-evans/create-pull-request` step.

### Field-filter typeahead

**Status:** not added.
**Why deferred:** with the FIELD filter currently scrollable (220 px max-height)
and showing ~22 entries, search isn't critical yet. Becomes useful at 50+.
**When to do it:** when the field count crosses ~40.

### Wholesale parser migration to `make_ad`

**Status:** factory exists; parsers still use their old construction styles.
**Why deferred:** `iit_rolling.py` is the most complex parser (~415 lines)
and is currently working correctly across 3 IITs. Re-routing every code path
through `make_ad` in one pass risks introducing a subtle field-omission
regression. Better to migrate parser-by-parser the next time each is touched
for unrelated reasons.

### Touch-target compromise on `.chip-active button`

**Status:** sized to 24×24 (WCAG 2.5.8 AAA minimum), not 44×44 (AA strict).
**Why deferred:** strict AA would visibly inflate every active-filter chip.
The 24×24 compromise is documented in CSS comments. Revisit if the dashboard
adds a touch-first mode.

## Operational housekeeping

After any non-trivial edit to `scraper/`:

```sh
make test                    # 56 tests; should be all green
make scrape ARGS='--limit 5' # smoke-test against 5 institutions
```

After dependency bumps:

```sh
make deps
make test
.venv/bin/pip freeze > requirements.txt   # commit the new pins
```

PDF cache busting (when an institution updates their rolling-ad PDF):

```sh
make scrape-fresh
```

HTTP cache busting (rarer; when a registry URL is unchanged but the upstream
HTML structure has changed):

```sh
rm -f .cache/http_cache.sqlite
make scrape
```
