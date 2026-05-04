"""Shared constants for the scraper.

Centralised so tweaks land in one place rather than getting sprinkled across
five files. Each value below was a magic number somewhere; the comments
explain *why* this number and not another.
"""

from __future__ import annotations

# ---- ad-record sentinels ---------------------------------------------------

#: Placeholder set by parsers when `institution_id` will be assigned by the
#: orchestrator (because parsers don't know their own registry slug). The
#: orchestrator's `normalize_ad` checks against this exact string and rewrites
#: it. Keep as a literal both places — duck-typed across ~4 files.
PLACEHOLDER_INSTITUTION_ID = "__placeholder__"


# ---- excerpt sizing --------------------------------------------------------

#: Cap on per-unit excerpt length emitted by the IIT rolling-ad parser. Big
#: enough that IIT-D's HSS sub-areas (Sociology / STS / SoPP) all sit within
#: the same unit's text and the dashboard classifier can find their keywords;
#: small enough that 30+ ads don't bloat current.json past a few MB.
IIT_UNIT_EXCERPT_MAX_CHARS = 3500

#: Cap on the IIM short-PDF excerpt. IIM PDFs are single-position ads — 700
#: chars typically captures the position description without dragging in
#: page-footer boilerplate.
IIM_PDF_EXCERPT_MAX_CHARS = 700

#: IIT Kanpur uses HTML paragraphs per department; this cap is on a single
#: department's areas-of-specialization paragraph.
IIT_KANPUR_DEPT_EXCERPT_MAX_CHARS = 4000


# ---- parser limits ---------------------------------------------------------

#: Number of faculty-recruitment PDF candidates the IIM parser will follow per
#: page. Above this, we drop with a log warning. 6 is the highest count we've
#: actually seen on a single IIM career page.
IIM_MAX_PDF_CANDIDATES = 6

#: How many lines below a unit-header to look for wrapped name continuations
#: in a rolling-ad PDF. IIT-Madras's HSS unit name spans 3 lines; tolerating
#: up to 12 lets us absorb intermediate areas-column lines that interleave.
NAME_CONTINUATION_LOOKBACK = 12

#: Maximum unit-name length emitted by the splitter. Beyond this we truncate.
#: 80 chars covers the longest legitimate department names ("Centre for
#: Technology Alternatives for Rural Areas (C-TARA)" = 51).
UNIT_NAME_MAX_CHARS = 80

#: First-column maximum width used by the TOC-detector regex. If a unit name
#: is longer than this, the TOC detector might miss a TOC line (false negative
#: tolerated). Real institution names rarely exceed 60.
TOC_FIRST_COLUMN_MAX_CHARS = 60


# ---- cache + freshness -----------------------------------------------------

#: Default time-to-live for the PDF cache. Set to 24h so reruns within a day
#: are free; set lower (e.g. 0) via `--refresh-pdfs` to force re-fetch when
#: testing parser changes against upstream-updated PDFs.
PDF_CACHE_TTL_SECONDS = 24 * 60 * 60

#: Lower bound on accepted deadline years in `find_deadline`. Computed at
#: parse time as `datetime.now().year - 1` — this constant is just the floor
#: below which we *always* reject (catches the "30/06/19" / "31/12/2020" kind
#: of stray date that looks like a deadline but is from years past).
HARD_FLOOR_DEADLINE_YEAR = 2020
