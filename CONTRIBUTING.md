# Contributing

The site grows by adding institutions and by improving the analysis on
The Gap. Most contributions land as either (a) a new per-site parser
in `scraper/parsers/`, (b) a new entry in
`docs/data/institutions_registry.json`, or (c) a chart or section on
The Gap. This document covers (a) and (b); for (c) write to the
maintainer first to align on framing.

## Priority queue

Most-impactful contributor work, roughly ordered:

### 1. Central Universities via Samarth public search (high impact, hard)

Most Central Universities have migrated their recruitment listings to
Samarth eGov's public-search portal at `curec.samarth.ac.in`. The
site's coverage of CUs is currently thin because each university's
own site doesn't always carry the listing — Samarth does. A parser
that walks `curec.samarth.ac.in` and returns one `JobAd` per
publicly-listed recruitment would unblock dozens of institutions at
once.

Useful starting points:

- The portal exposes a public listing UI at `curec.samarth.ac.in`.
  Treat it as a HTML+JSON-fetched view; respect rate limits.
- Most listings link out to a per-university notification PDF; the
  PDF is the source of truth. Parser should return both — the
  Samarth listing as `original_url`, the PDF as `apply_url` /
  `annexure_pdf_url`.
- Reservation breakdowns are sometimes in the listing JSON; sometimes
  in the PDF; sometimes nowhere. Use the existing Composite /
  Single-position / Special Recruitment Drive logic to render the
  reservation row appropriately.
- **Do not touch `admin.samarth.ac.in`.** That is the authenticated
  admin ERP for institutions; scraping it is both unauthorised and
  pointless for our purposes.

### 2. State-government universities (high impact, medium)

The site currently covers centrally-funded HEIs (Central Universities,
IITs, IIMs, NITs, IIITs, AIIMS) and a handful of major private
universities. State-government universities are absent. They serve far
more students than the central system does and are systematically
excluded from the parliamentary disclosure regime that *The Gap*
analyses — which makes their hiring practices doubly opaque.

A reasonable first cut:

- One parser per university, beginning with the largest by faculty
  headcount: University of Madras, Calcutta University, Mumbai
  University, Bangalore University, Anna University, Jadavpur
  University, Andhra University, Sri Venkateswara University, Osmania
  University, Pune University, etc.
- Add a registry entry per university (`docs/data/institutions_registry.json`)
  with `type: "StateUniversity"`, the city, the state, the
  recruitment-page URL, and a `parser` slug.
- Reservation policy at state universities follows state-government
  rules, not the CEI(RTC) Act, 2019 — the per-state SC/ST/OBC/EWS
  percentages differ from the central mandate. Don't reproduce central
  reservation pills on state-uni cards; render the state's policy when
  the listing publishes it, and the existing "Single-position
  recruitment" / "Composite recruitment" logic when it doesn't.

### 3. Per-IIT and per-IIM coverage gaps

Some IITs and IIMs are well-covered; others go silent for months
because their parser has rotted. Run `make scrape ARGS='--limit 200'`
locally and compare `docs/data/coverage_report.json` against the
prior day's; institutions with `0` ads after several days deserve
attention.

### 4. PDF parsers

Several institutions publish only the notification PDF, not a
structured page. The PDF parser in `scraper/pdf_extractor.py` works
on most layouts but degrades on multi-column or scanned-image PDFs.
Improvements there land everywhere.

## Parser contract

```python
def parse(html: str, url: str, fetched_at: datetime) -> list[dict]: ...
```

Each parser is one file in `scraper/parsers/<slug>.py`, one slug per
institution or institution-family.

- **No side effects.** Do not fetch additional URLs from inside a
  parser. If you need PDF contents, register the PDF URL on the ad
  and let the orchestrator's enrichment pass do the fetch.
- **Return `[]` on a page with no ads.** Do not raise.
- **Self-report `parse_confidence`** on every record. 0.9 when fields
  come from structured DOM elements; 0.5 when you regex free text;
  0.3 when you're guessing. Cards with `parse_confidence < 0.45`
  surface a "⚠ rough parse" pill so candidates know to verify.
- **Use `ad_factory.make_ad(**kwargs)`** to build the dict — it
  enforces the canonical key contract and fills in defaults.
  Per-parser dict-construction is being migrated to the factory; if
  you're touching a parser anyway, migrate it.

## Adding an institution

1. Add a row to `docs/data/institutions_registry.json` with the
   institution's id, name, short name, type, city, state,
   `careers_page_url_guess`, and a `parser` slug.
2. Add `scraper/parsers/<slug>.py` implementing `parse(...)` per the
   contract above.
3. Run `make test` — there is a `test_parser_contracts.py` that
   parametrises every parser against three contract assertions; your
   new parser will be picked up automatically and must pass all three.
4. Run `make scrape ARGS='--limit 5'` to smoke-test against the new
   institution.
5. Commit the registry entry and the parser file together.

## Testing

- **Contract floor**: `test_parser_contracts.py` parametrises every
  parser against three assertions — imports cleanly, returns `list`
  for empty input, returns `list` for malformed input. New parsers
  are picked up automatically.
- **Per-parser fixture tests**: save a representative HTML page to
  `scraper/parsers/tests/<slug>.html` and write a fixture test that
  asserts the parser returns the expected number of ads with the
  expected fields.
- **No live calls in tests.** All HTTP is mocked at the `requests`
  level; parsers receive raw HTML strings.

Run the suite:

```bash
make test
```

119 tests pass at the time of writing; new parsers should not break
the count.

## Hall of forbidden moves

These are non-negotiable. PRs that violate them will be declined.

- **Do not scrape `admin.samarth.ac.in`** or any institutional ERP
  whose terms forbid automated access. Public-search portals
  (`curec.samarth.ac.in`) are in scope; admin ERPs are not.
- **Do not fabricate field values** when the source page does not
  contain them. Null is the right answer; the card surfaces "Not
  specified by the department" so readers can see institutional
  silence as a pattern.
- **Do not disable rate limiting** (`fetch.py` enforces ≥1.5s/host
  by default) or remove the identifying `User-Agent`. These protect
  upstream servers and the project's ability to keep running.
- **Do not commit advertisement PDFs to the repo.** We index; we do
  not rehost. Source PDFs stay on the institution's own servers.
- **Do not soften analysis.** PRs that generalise from "SC, ST, OBC,
  EWS, PwBD candidates" to "marginalised communities" or
  "stakeholders" — or that add institutional-perspective hedges to
  The Gap's specific claims without primary-source evidence — will
  be declined.

## Editorial register (for content contributions to *The Gap*)

The Gap reads as journalism in the parliamentary-record tradition,
not as op-ed. Three constraints:

1. **Every claim is sourced** to a parliamentary question, court order,
   or official Ministry of Education communication, and the source is
   listed in the page-end bibliography.
2. **Institutions and individuals are named when the record names
   them.** "The Ministry of Education", "the IIT directors",
   "Mallikarjun Kharge", "Sukanta Majumdar" — not "the relevant
   authorities".
3. **Reservation categories are named specifically.** SC, ST, OBC,
   EWS, PwBD, Bahujan as a collective political identity — not
   "marginalised", "underrepresented", "communities".

## Bug-fix priority

When a card displays incorrect information, the order of severity is:

1. **Wrong closing date** → user acts on it → highest priority.
2. **Wrong institution / city** → user applies to the wrong place → high.
3. **Wrong reservation breakdown** → political claim is wrong → high.
4. **Wrong rank or contract** → cover-letter-level mismatch → medium.
5. **Wrong discipline / sub-area** → filter-level → medium.
6. **Wrong cosmetic detail** (e.g., "ad #") → low.

Fix in this order; don't rebuild the heuristic-parser hierarchy because
of a cosmetic bug.
