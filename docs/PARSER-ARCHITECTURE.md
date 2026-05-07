# PARSER ARCHITECTURE

A design document for the institutional-scrape pipeline. Written after a
read-through of representative ads across all 46 active sources (~384
ads in the May 2026 corpus). Identifies the recurring structural shapes,
the architectural debt that has accumulated through ad-hoc per-parser
fixes, and a prioritised refactor plan.

The companion file is `docs/MISTAKES.md`, which catalogs the specific
failures that motivated this rewrite. Read this file before extending or
rewriting any parser; read `MISTAKES.md` before tweaking regex.

---

## 1 — What the corpus actually looks like

### 1.1 — Five structural shapes recurring across institutions

After reading 1–3 sample ads from every active institution, every ad
fits into one of five structural patterns. The parser architecture
should recognise these as first-class shapes rather than reinventing
extraction per institution.

**A. Multi-column rolling-ad PDF (IITs).**
A single PDF carries every department's vacancy in a 4-column
table: `[S.No | Unit name | Areas of specialisation | Additional
criteria]`. The Areas column itself often has sub-columns
(letter-prefix `a. b. c. …` + area name) and the Criteria column is
sectioned (`Publication Record:`, `Academic Background:`, `Other:`).
Used by: IIT Delhi, Bombay, Madras, Kanpur (variant), Roorkee,
Hyderabad, Indore, Bhubaneswar, etc.

**B. Per-position HTML detail pages (modern private universities).**
The career index is a list of position links; each position has its
own HTML page with `<meta description>`, narrative `<p>` paragraphs,
`<section>` blocks for Requirements / Application Procedure, and a
single discipline implied by the page title.
Used by: APU, Ashoka per-position pages.

**C. Per-row HTML tables (FLAME).**
A single index page is a wide table where each row is one position;
the row carries discipline, rank, and a body cell with the call.
Used by: FLAME.

**D. Single-PDF table-of-departments + separate eligibility annexure (IIT Madras-style).**
Specialisations come from one PDF; eligibility from another. Layout
is multi-column-but-not-row-aligned and traditional layout extraction
mashes columns. Used by: IIT Madras (mostly), some IIT Hyderabad
ads.

**E. "No discrete postings" stub (most IIMs, several IIT careers pages).**
The institution publishes no per-position ad — applications are
routed through a single rolling form. The "ad" is an editorial stub
naming the institution's documented application channel.
Used by: 14 of the 21 IIMs in the registry; several IITs with empty
careers pages.

### 1.2 — Per-institution audit, May 2026 corpus

**Working well (clean structured output):**
- APU (27 ads, confidence 0.85) — narrative + structured
  unit_eligibility + number_of_posts.
- FLAME (68 ads, 0.72) — narrative + discipline + rank.
- Ashoka manual override (3 ads, 0.55) — full structured_position
  hand-curated.

**Working but with the column-mashing bug (Shape A):**
- IIT Delhi (26 ads), IIT Bombay (31), IIT Madras (18), IIT Kanpur
  (38), IIT Hyderabad (58 — many sub-positions), IIT Roorkee (5),
  IIT Bhubaneswar (4), IIT Palakkad (4), IIT Dharwad (4), IIT
  Varanasi-BHU (3), IIT Indore (3), IIT Gandhinagar (2), IIT
  Guwahati (2), IIT Kharagpur (1), IIT Jodhpur (1), IIT
  Bhilai/Goa/ISM Dhanbad (network errors).

**Title and excerpt picking up site chrome instead of ad content:**
- IISc Bangalore (23 ads, 0.5) — every excerpt is just "Faculty
  Recruitment".
- IISER Tirupati (24 ads, 0.5) — every excerpt is "Postdoctoral
  Research Fellows".
- IISER Thiruvananthapuram (1) — same shape.
- Ahmedabad University (1, 0.45) — 700 chars of nav menu
  ("Faculty About Ahmedabad Stepwell Student Affairs Alumni…").
- Krea University (1, 0.4) — 700 chars of header chrome
  ("Search Button Campus Visit Why Krea Careers Giving UGC
  Contact Portal Login").
- IIT Roorkee, Dharwad, Palakkad, Varanasi-BHU, Bhubaneswar — all
  pick up section labels ("Recruiters", "English", "Recruitment",
  "Other Job Openings").
- Shiv Nadar (8 ads, 0.65) — entire row of the listings table
  ("3675 | Assistant Professor - Design Engineering And Robotics
  School of Engineering (SoE) | Jun 30, 2026 | Apply") becomes the
  excerpt.
- JGU Sonipat (5 ads, 0.55) — same row-as-excerpt pattern with
  trailing "Know More" link text.

**Title is wrong but body text is right (PDF link-text leakage):**
- IIM Bodh Gaya — title is "⬇ Detailed Advertisement" (the
  download-arrow glyph + the link's anchor text).
- IIM Mumbai — title is "Download Details".
- IIT Hyderabad — titles are full advertisement-name strings often
  duplicated.

**Stub by design (Shape E, no real ad to scrape):**
- 14 IIMs: Ahmedabad, Bangalore, Calcutta, Indore, Kashipur,
  Kozhikode, Lucknow, Raipur, Ranchi, Sambalpur, Shillong,
  Sirmaur, Trichy, Udaipur, Visakhapatnam, Amritsar.
- IIT Kharagpur, NLS Bangalore, IIIT Bangalore/Hyderabad —
  stubbed for the same reason.

**Empty body (PDF download or extraction failed):**
- IIT Indore (3, 0.75) — title decent, excerpt empty.
- IIT Kanpur (38, 0.7) — title is parser-internal ("Faculty —
  Kanpur Department-Wise Area of Specialization X"), excerpt
  empty.

---

## 2 — Architectural debt observed

### 2.1 — There is no shared text-extraction layer

Each parser owns its own dirty work. `iit_rolling.py` has
`_short_excerpt`, `_split_subareas`, `_extract_columns`,
`split_into_units`, `split_into_units_flow`, `_split_name_from_areas`.
`private_university.py` has `_apu_position_ad`, `_flame_table_ad`,
`_clean`, `_make_ad`. `iim_recruit.py` has its own. `pdf_extractor.py`
has shared splitters but no shared block-extractor.

The column-mashing bug that surfaced this rewrite is a Layer-2 (text
→ blocks) failure, but Layer 2 doesn't exist as a shared concern —
each parser reimplements what should be common scaffolding.

### 2.2 — There is no HTML chrome-stripper

Half the institutions in the corpus produce excerpts that are mostly
site-nav text. Krea, Ahmedabad, IISc, Shiv Nadar, JGU, the
title-only IITs — every one of them is grabbing
`document.body.innerText` (or near-equivalent) without first
removing the header / nav / footer / search chrome.

A shared `strip_chrome(soup)` step would zero this out:
- Remove `<nav>`, `<header>`, `<footer>`, `<aside>`, `<form>`.
- Remove anything matching common nav-menu selectors
  (`.menu`, `.navbar`, `.site-header`, `[role=navigation]`,
  `[aria-label*=nav]`).
- Remove repeated text that appears on the same domain's other
  pages (cross-page intersection — chrome by definition
  duplicates).

### 2.3 — Title detection has no contract

Some parsers use `<h1>`, some pick the first non-empty H-tag, some
fall through to `<title>`, some use anchor text from the link that
got us there. When `<h1>` is the link arrow, the title becomes "⬇
Detailed Advertisement". When the page title is a generic site
banner, the title becomes "English" or "Recruiters".

A shared `extract_title(soup, url)` with priority:
1. `<h1>` whose text is not in the chrome wordlist
   (`{Recruitment, Apply, English, Recruiters, Faculty, Careers, …}`)
2. `<meta property=og:title>` minus site-suffix.
3. `<meta name=description>` first sentence.
4. Largest `<a>` text on the source URL.
5. Page-title minus site-suffix.

…would eliminate the "English English" / "Recruitment Recruitment"
titles without per-parser fixes.

### 2.4 — Field population is wildly inconsistent across parsers

The ad schema has more fields than any one parser populates. The
table below shows what each cluster actually populates:

| Field                  | APU | FLAME | IIT rolling | IIM Bodh | IISc | Stubs |
|------------------------|-----|-------|-------------|----------|------|-------|
| `title`                | ✓   | ✓     | ✓ (department) | ⚠ chrome | ⚠ chrome | ✓ |
| `discipline`           | ✓   | ✓     | ✓           | —        | —    | —     |
| `raw_text_excerpt`     | ✓   | ✓     | ⚠ mashed    | ✓        | ⚠ chrome | ✓ |
| `unit_eligibility`     | ✓   | —     | —           | —        | —    | —     |
| `general_eligibility`  | —   | —     | ✓           | —        | —    | —     |
| `publications_required`| —   | —     | ✓ (via splitter) | —   | —    | —     |
| `evaluation_criteria`  | —   | —     | —           | —        | —    | —     |
| `number_of_posts`      | ✓   | —     | —           | —        | —    | —     |
| `category_breakdown`   | —   | —     | rare        | rare     | —    | —     |
| `closing_date`         | ✓   | ✓     | ✓ (PDF)     | ✓ (PDF)  | —    | —     |
| `apply_url`            | ✓   | ✓     | source PDF  | source PDF | ✓ | ✓ |
| `_pdf_excerpt`         | —   | —     | rare        | ✓        | —    | —     |

The card renderer copes by walking a fallback chain: `structuredPos
?? pdf_excerpt ?? raw_text_excerpt`, plus separate fallback chains
for eligibility / publications. That fallback complexity exists
because no parser can promise which field will be populated.

### 2.5 — Confidence scores carry no semantic content

`parse_confidence` is hardcoded per parser:
- 0.85 — APU per-position
- 0.75 — IIT Indore PDF metadata
- 0.7 — IIT rolling, IIT Kanpur
- 0.65 — Shiv Nadar
- 0.6 — IIT Delhi-via-flow, several PDF parsers
- 0.55 — Ashoka, JGU
- 0.5 — IIT Madras (with column-mashing), IISc, all stubs
- 0.45 — Ahmedabad with chrome
- 0.4 — Krea with chrome

Same score (0.5) is used for parsers that produce clean output (IIT
Madras with full PDF extraction) and parsers that produce 100%
chrome (IISc). The score doesn't help the dashboard decide which
ads to surface or de-prioritise.

A derived score: count populated fields × length-quality × chrome-
penalty.

---

## 3 — Proposed layered architecture

### 3.1 — The five layers

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1   SOURCE                                            │
│ Fetch HTML/PDF. Cache. Per-domain rate-limit. (Today's      │
│ scraper/fetch.py is fine.)                                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 2   TEXT EXTRACTION                                   │
│ HTML → de-chromed text. PDF → layout-preserved text with    │
│ pagination footers stripped, form-feeds normalised, columns │
│ optionally separated.                                       │
│ Shared module: scraper/extract.py                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 3   STRUCTURED BLOCKS                                 │
│ Text → list[TextBlock(kind, text, source_locator)] where    │
│ kind ∈ {title, narrative, areas, eligibility,               │
│         publications, academic_background, other,           │
│         section_header}                                     │
│ Shared module: scraper/blocks.py                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 4   FIELD SYNTHESIS                                   │
│ Blocks → JobAd schema, with deterministic mapping (one      │
│ kind → one canonical field). Confidence derived from        │
│ block-coverage, not hardcoded.                              │
│ Shared module: scraper/synthesis.py                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ LAYER 5   ORCHESTRATION                                     │
│ scraper/run.py — already in place. Calls per-institution    │
│ adapter; the adapter calls Layers 1-4.                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 — TextBlock dataclass

```python
@dataclass(frozen=True)
class TextBlock:
    kind: Literal[
        "title",
        "narrative",
        "areas",
        "eligibility",
        "publications",
        "academic_background",
        "other_criteria",
        "section_header",
        "boilerplate",
        "chrome",          # to be discarded
    ]
    text: str
    source_locator: str    # CSS selector / PDF "page N line M"
    confidence: float = 1.0  # detection confidence, separate from ad-quality
```

A parser produces a list of TextBlocks. Layer 4 maps:

| Block kind             | JobAd field              |
|------------------------|--------------------------|
| `title`                | `title`                  |
| `narrative`            | `raw_text_excerpt`       |
| `areas`                | `discipline_focus` (NEW) |
| `eligibility`          | `unit_eligibility`       |
| `publications`         | `publications_required`  |
| `academic_background`  | `academic_background_note` (NEW) |
| `other_criteria`       | `evaluation_criteria`    |
| `section_header`       | discarded                |
| `boilerplate`          | discarded (with tracking)|
| `chrome`               | discarded                |

Schema additions: `discipline_focus`, `academic_background_note`.
Schema field that becomes redundant: `general_eligibility` (folds
into `unit_eligibility`).

### 3.3 — Per-institution adapters become thin

A modern adapter looks like:

```python
def parse(text: str, url: str, fetched_at: datetime) -> list[dict]:
    if not text:
        return []
    soup = BeautifulSoup(text, "html.parser")
    soup = strip_chrome(soup)        # Layer 2 helper
    page_text = clean_text(soup)
    blocks = extract_blocks_html(    # Layer 3 helper
        soup, page_text, url,
        institution_hints=APU_HINTS,
    )
    ad_dict = synthesise_ad(blocks, url, fetched_at)  # Layer 4
    return [ad_dict] if ad_dict else []
```

The institution-specific knowledge lives in `APU_HINTS` — a small
config: known section-label patterns, where the title sits, how
many positions per page, etc. — not in Python branches.

### 3.4 — IIT rolling-ad refactor (immediate priority)

The PDF rolling-ad parser becomes:

1. `extract_layout_text(pdf)` → str (today's `extract_text`).
2. `split_into_units(text)` → list[UnitBlock] (today's, plus
   `\f`-strip already in place).
3. `unit_to_blocks(unit)` → list[TextBlock] — NEW. This is the
   replacement for `_short_excerpt`. It uses per-line column
   boundary re-detection (find the largest whitespace gap on
   each line near the header's anchor positions) and emits:
   - One `areas` block per area item (letter-prefix or
     sub-area-header).
   - One `publications` block per bullet item.
   - One `academic_background` block.
   - One `other_criteria` block per `(a)/(b)/(c)` item.
4. `synthesise_ad(blocks, ...)` → dict.

The card renderer then knows that each ad has an Areas list,
maybe a Publications list, etc. — no more guessing at the
structure of `raw_text_excerpt`.

### 3.5 — HTML chrome-stripper (immediate priority)

```python
def strip_chrome(soup: BeautifulSoup) -> BeautifulSoup:
    for tag in soup(["nav", "header", "footer", "aside",
                     "form", "script", "style", "noscript",
                     "svg"]):
        tag.decompose()
    for sel in [".menu", ".navbar", ".site-header",
                ".site-footer", ".breadcrumbs",
                "[role=navigation]", "[role=banner]",
                "[aria-label*=nav i]"]:
        for el in soup.select(sel):
            el.decompose()
    return soup
```

Eliminates the chrome-bloat seen in Krea, Ahmedabad, IISc, Shiv
Nadar, JGU, Roorkee, Dharwad, Palakkad, Varanasi-BHU,
Bhubaneswar — about a quarter of the corpus.

### 3.6 — Title detection (medium priority)

```python
CHROME_TITLES = {
    "recruitment", "recruiters", "apply", "english",
    "faculty", "careers", "jobs", "vacancies",
    "download details", "detailed advertisement",
    "other job openings", "rolling advertisement",
}

def extract_title(soup, url, fallback) -> str:
    for h1 in soup.find_all("h1"):
        t = h1.get_text(strip=True)
        if t and t.lower() not in CHROME_TITLES:
            return t
    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        return strip_site_suffix(og["content"])
    desc = soup.find("meta", attrs={"name": "description"})
    if desc and desc.get("content"):
        return first_sentence(desc["content"])
    # …etc.
    return fallback
```

---

## 4 — Refactor priorities

Ordered by visible-improvement-per-hour:

**P0 — IIT rolling per-line column re-detection.**
Fixes the column-mashing visible on every IIT ad (~190 ads of 384,
half the corpus). The dead `_extract_columns` function in
`iit_rolling.py` is the foundation; needs the per-line gap-
detection loop added. Estimated 1–2 hours plus tests for 5
fixture units.

**P1 — `strip_chrome()` shared helper.**
Fixes IISc, IISER, Krea, Ahmedabad, Shiv Nadar, JGU, several IITs.
About a quarter of the corpus suddenly produces real-content
excerpts. Estimated 1 hour plus a test that hits each affected
parser.

**P2 — Title-detection with chrome blacklist.**
Fixes "English / Recruitment / Recruiters" titles across many
institutions. Estimated 30 minutes plus tests.

**P3 — TextBlock framework + adapter refactor.**
The big architectural cleanup. Replaces `_make_ad` and
`_short_excerpt` and the parser-internal field-population logic
with a shared synthesis layer. Estimated 4–8 hours; ships across
multiple PRs as each parser is migrated.

**P4 — Schema cleanup.**
Add `discipline_focus`, `academic_background_note`. Drop
`general_eligibility` (fold into `unit_eligibility`). Document
canonical use of each field. Estimated 1 hour after P3 lands.

**P5 — Confidence scoring rework.**
Derive from block coverage. Cosmetic but useful for the
dashboard's quality filter. Estimated 30 minutes.

---

## 5 — Workflow rules for parser changes

These are codified from `memory/feedback-parser-workflow.md` and
from `docs/MISTAKES.md`'s 2026-05-06 entry. Read both before
opening this file in an editor.

1. **Read 5+ sample sources before writing parser code.** Fetch
   the actual HTML or PDF, dump it in conversation, identify the
   structural pattern, then code.

2. **No LLM calls inside `scraper/`.** Runtime stays
   deterministic. Pre-flight design (in conversation) is the
   permitted use of LLM understanding.

3. **Every parser fix needs a regression test.** Add a fixture
   to `scraper/tests/` and a test that pins the corrected output.
   Do not declare a fix shipped without one.

4. **Run `split_into_units` end-to-end against a real cached
   PDF after any change to the pdf-extractor.** Unit tests in
   isolation are not sufficient — the IITD bleed-through
   regression of 2026-05-06 was invisible to isolated tests but
   immediately visible in the integration check.

5. **A parser that surfaces site-chrome instead of ad content is
   broken even if it returns ads.** Confidence ≤ 0.5 with chrome
   text in the excerpt is not "fine for now"; it is shipping
   noise to the reader.

---
