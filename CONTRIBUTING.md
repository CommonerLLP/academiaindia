# Contributing

The project lives or dies by its parsers. One parser per institution; each parser is a single file in `scraper/parsers/`. Contributions welcome.

## Parser contract

```python
def parse(html: str, url: str, fetched_at: datetime) -> list[JobAd]: ...
```

- **No side effects.** Do not fetch additional URLs from inside a parser (v1). If you need PDF contents, add a separate enrichment step.
- **Return `[]` on a page with no ads.** Do not raise.
- **Raise `ParseError` on a structural surprise** (e.g., expected table not found). The orchestrator will log and fall back to `generic`.
- **Self-report `parse_confidence`.** 0.9 when you pull fields from structured DOM elements; 0.5 when you regex free text; 0.3 when you're guessing.

## How to add a parser

1. Add a file `scraper/parsers/<slug>.py` (slug matches the institution's `id` with underscores instead of hyphens).
2. Implement `parse(...)` per the contract above.
3. In `scraper/build_registry.py`, set the institution's `parser="<slug>"`.
4. Re-run `python scraper/build_registry.py`.
5. Test locally: `python scraper/run.py --limit 20` or write a fixture test.

## Fixture-based testing

To test a parser without hitting the live site, save a representative page to `scraper/parsers/tests/<slug>.html` and run:

```python
from pathlib import Path
from datetime import datetime
from scraper.parsers import <slug>

html = Path("scraper/parsers/tests/<slug>.html").read_text()
ads = <slug>.parse(html, "https://...", datetime.utcnow())
for ad in ads:
    print(ad.title, ad.closing_date, ad.original_url)
```

## Priority parsers

Most impactful first, roughly by faculty headcount × current breakage likelihood:

- iit_bombay
- iit_madras
- iit_kharagpur
- iit_kanpur
- iisc_bangalore
- du (University of Delhi — highest faculty count among CUs)
- jmi (Jamia Millia Islamia)
- bhu (Banaras Hindu University)
- amu (Aligarh Muslim University)
- iim_calcutta, iim_ahmedabad, iim_bangalore, iim_lucknow

## Hall of forbidden moves

- Do not scrape Samarth eGov. It has a ToS that forbids automated access; respect it.
- Do not fabricate a field value if the source page does not contain it. Null is preferable to a false positive, because this feed is consumed by real job-seekers.
- Do not disable rate limiting or the User-Agent. These protect both the upstream servers and the project's ability to keep running.
- Do not commit an advertisement PDF file to the repo. We index; we do not rehost.

## Data-quality bugs vs. parser bugs

- A parser that returns zero ads for a page with ads = **parser bug**.
- A parser that returns an ad with wrong closing_date = **data-quality bug** (worse, because users act on it).
- A parser that returns ads with wrong post_type classification = **enrichment bug** (mostly cosmetic).

Fix order: data-quality > parser > enrichment.
