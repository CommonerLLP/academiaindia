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
| SSRF allowlist | `is_safe_url` in `scraper/url_safety.py` — single shared surface used by `pdf_extractor.py` AND `fetch.py`. Rejects non-http(s), private, loopback, link-local, reserved, multicast (IPv4 224.0.0.0/4 / IPv6 ff00::/8), unspecified (`0.0.0.0` / `::`), and IPv6 ULA (`fc00::/7`). Multi-A-record hostnames are evaluated pessimistically (any private IP rejects the URL). 33 unit tests in `test_url_safety.py`. |
| `stable_id` deduplication | was 4 implementations (one crashed on `None`); `curated_iit_hss.py` now delegates to the canonical `ad_factory.stable_id` so there is exactly one definition. |
| `ad_factory` test coverage | 12 unit tests in `test_ad_factory.py` covering canonical-keys contract, defaults, date-coercion, and extras pass-through. Pre-requisite for the parser → factory migration listed below. |
| Cross-parser contract floor | `test_parser_contracts.py` parametrises every parser in `scraper/parsers/` (9 modules) against three contract assertions: imports cleanly, returns `list` for empty input, returns `list` for malformed input. Catches regressions where a parser silently breaks. |
| IIT-Kanpur frozen `KNOWN_DEPTS` | now 2-pass: known-name pass + generic `<ProperNoun phrase>:` fallback; unmatched matches log at INFO |
| Pydantic schema drift | `JobAd` declares `model_config = ConfigDict(extra="allow")` and lists the parser-attached optional fields explicitly |
| Single ad-factory | `scraper/ad_factory.make_ad(**kwargs)` available; full migration of every parser deferred (high-risk wholesale change) |
| `run.py` mega-ternary CoverageRow | refactored to explicit if/elif branches in `record_outcome()` |
| Unit tests | 119 tests + 9 deliberate skips across `scraper/tests/` (was 56). New files: `test_ad_factory.py`, `test_url_safety.py`, `test_parser_contracts.py`. Run via `make test`. |
| Archive retention helper | `scraper/prune_archive.py` (30 days daily / 52 weeks weekly / quarterly thereafter); `make prune-archive` |
| `fetch.py` cache semantics doc | inline docstring expanded |
| Field-pill dark-mode border | added in `dashboard/index.html` for `[data-theme="dark"]` |
| Dashboard cache-bust on JSON | replaced with `cache: "no-cache"` so 304-conditional reloads work |
| Logo `onerror=` inline → event listener | `wirePortrait()` in `dashboard/index.html` |
| Dashboard single-file split | `docs/index.html` (277 lines, was 5,512) + `docs/styles.css` (1,230 lines) + `docs/app.js` (4,003 lines). Theme-flash-prevention script stays inline in `<head>`. Saves ~370 KB on every page-load after the first because CSS/JS are cached separately from HTML. |
| Visiting Faculty post-type | `scraper/schema.py` already had `PostType.Visiting`; surfaced as a 5th Position-filter checkbox in `docs/app.js` with a dedicated `isVisitingMatch` predicate so visiting positions don't silently mix into Asst/Assoc/Full counts. |
| Manual-entry provenance pill | `docs/app.js` adds a yellow "⚑ manual entry" pill on listing cards where `_manual_stub === true` and `_source_method` matches `/manual transcription/i`. Hover-tooltip explains the provenance gap. Auto-applies to any future hand-transcribed entry. |
| Disclaimer pass (liability shield) | Lede simplified ("A public-interest tracker of academic work in India."); meta tags realigned. On-page disclaimers added: research/reference caveat below the vacancy-gap banner; CFHEI-only scope statement at the top of The Gap; expanded colophon with no-warranty / independence / analytical-content paragraphs. |
| WCAG 2.1 AA pass | All 7 findings from `/design:accessibility-review` audit resolved: `role="tablist"` + roving `tabindex` + arrow-key nav on the top tabs; 44×44 touch targets on filter triggers, Reserved-posts toggle, and star save buttons; `aria-haspopup` + `aria-expanded` on filter-dropdown triggers; explicit `type="button"` on every non-form button; global `*:focus { outline: none }` removed in favour of `:focus-visible` only; `<html lang="en-IN">`. |
| Favicon + OG card | `docs/favicon.svg` (oxblood rounded square + ivory italic "?"), `docs/og.svg` (1200×630, two-column publication-register layout), `docs/og.png` (raster fallback for X/Twitter, generated via `rsvg-convert -w 1200 -h 630 og.svg -o og.png`). Wired into `<head>` via `<link rel="icon">`, `og:image`, `twitter:image`, plus `theme-color` meta. |

## Deferred (with rationale)

These items are real debt, not done in this pass either because they were
out of scope for "code edits to the existing codebase" or because the
remediation would itself be high-risk.

### SSRF residual risks: DNS rebinding + TOCTOU

**Status:** documented, not engineered around.
**The exposures the current `is_safe_url` does NOT mitigate:**

  * **DNS rebinding.** An attacker who controls the authoritative DNS for a
    hostname can return a public IP to `socket.getaddrinfo` (passing the
    guard) and then a private IP a few seconds later when `requests.get`
    actually opens the TCP connection. The window is bounded by request
    timeout + per-host rate limit.
  * **TOCTOU.** `getaddrinfo` and the eventual TCP connect are separate
    syscalls. A fast-flux DNS could differ between the two. Same window
    as above.

**Why not engineer around it:** the standard mitigation (resolve once, pin
the IP, pass the IP to the connection with the original Host header) breaks
TLS SNI for HTTPS and is overkill for the threat model — a single-maintainer
research scraper hitting government and university PDFs. The realistic
mitigations are (a) the `timeout=` already passed to `requests.get` (60s
default) and (b) the per-host `_rate_limit()` in `fetch.py` (1.5s default).
Both keep the rebinding window short enough that the residual risk is
acceptable for the deployment model.

**When to revisit:** if this scraper is ever deployed on shared infrastructure
(e.g., as a hosted service rather than a one-user research tool), the cost
of an in-network SSRF goes up substantially and the engineering investment
becomes worth it. Until then, the timeout + rate-limit pair is the floor.

### Ad-factory migration of remaining parsers

**Status:** factory exists with 12 unit tests; ad_factory is the canonical
construction path; 11 parsers in `scraper/parsers/` still emit dicts directly.
**Why deferred:** `iit_rolling.py` is the most complex parser (~415 lines)
and is currently working correctly across 3 IITs. Re-routing every code path
through `make_ad` in one pass risks introducing a subtle field-omission
regression. Better to migrate parser-by-parser the next time each is touched
for unrelated reasons. The factory's test coverage and the parser-contract
test floor are the prerequisites for safe migration; both are now in place.

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

### Touch-target compromise on `.chip-active button`

**Status:** sized to 24×24 (WCAG 2.5.8 AAA minimum), not 44×44 (AA strict).
**Why deferred:** strict AA would visibly inflate every active-filter chip.
The 24×24 compromise is documented in CSS comments. Revisit if the dashboard
adds a touch-first mode.

## Operational housekeeping

After any non-trivial edit to `scraper/`:

```sh
make test                    # 119 tests + 9 skips; should be all green
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
