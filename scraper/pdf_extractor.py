"""PDF extraction helpers for rolling faculty advertisements.

Most IIT/IIM/IISER rolling ads share a common shape: a header section with
institute-wide eligibility, then a numbered table where each row is one
academic unit, with columns "Areas of Specialization" + "Eligibility" +
"Publications". We exploit that pattern here to split a PDF into per-unit
blocks that the institutional parsers can pick over.

`pdftotext -layout` (Poppler) is the underlying extractor — it preserves
column alignment well enough that a regex-based splitter is viable, where
PyPDF2 / pdfminer would lose the layout. The drawback is the system
dependency on Poppler; we fall back gracefully if it's missing.
"""

from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

from constants import (
    HARD_FLOOR_DEADLINE_YEAR,
    NAME_CONTINUATION_LOOKBACK,
    PDF_CACHE_TTL_SECONDS,
    UNIT_NAME_MAX_CHARS,
)
# SSRF guard lives in `url_safety` so the same policy surface is shared with
# `fetch.py`. Imported here as `_is_safe_url` because the existing call sites
# (and tests) reference that name; the alias is a single line of indirection.
from url_safety import is_safe_url as _is_safe_url

logger = logging.getLogger(__name__)

PDFTOTEXT = shutil.which("pdftotext")


@dataclass
class UnitBlock:
    """One academic-unit block extracted from a rolling-ad PDF."""
    unit_num: int
    unit_name: str
    text: str


def has_pdftotext() -> bool:
    return PDFTOTEXT is not None


def download_pdf(
    url: str,
    dest_dir: Path,
    *,
    timeout: float = 60.0,
    max_age_seconds: Optional[int] = None,
) -> Optional[Path]:
    """Download a PDF, return the local path. Returns None on failure.

    Caching: a previously-downloaded file with the same sanitized basename is
    re-used if it's younger than `max_age_seconds` (default `PDF_CACHE_TTL_SECONDS`,
    24h). Set `max_age_seconds=0` to force a re-fetch — that's how
    `make scrape-fresh` busts the cache when upstream has shipped a new
    version of the rolling-ad PDF.

    Filename sanitization: we strip everything except `[A-Za-z0-9._-]` and
    cap at 200 chars. `..` survives the regex but is harmless because we
    treat the result as a single filename component (no path traversal).

    Hardening: refuses non-http(s) URLs and URLs whose hostname resolves to
    private/loopback/link-local IPs (SSRF guard).
    """
    if not _is_safe_url(url):
        logger.warning("download_pdf: refusing unsafe URL %s", url)
        return None
    if max_age_seconds is None:
        max_age_seconds = PDF_CACHE_TTL_SECONDS
    dest_dir.mkdir(parents=True, exist_ok=True)
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", url.split("?")[0].split("/")[-1])[:200] or "doc.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    path = dest_dir / name
    # Cache hit? File exists, has bytes, and is fresh.
    if path.exists() and path.stat().st_size > 0:
        age = time.time() - path.stat().st_mtime
        if max_age_seconds == 0:
            logger.info("download_pdf: cache busted (max_age=0); re-fetching %s", url)
        elif age <= max_age_seconds:
            return path
        else:
            logger.info(
                "download_pdf: cache stale (%.1fh old, ttl %.1fh); re-fetching %s",
                age / 3600, max_age_seconds / 3600, url,
            )
    try:
        r = requests.get(
            url,
            timeout=timeout,
            allow_redirects=True,
            headers={"User-Agent": "india-hei-job-tracker/0.1 (+mailto:solanki.aakash@gmail.com)"},
        )
    except requests.RequestException as e:
        logger.warning("download_pdf: network error for %s: %s", url, e)
        # If we have a stale-but-real cached file, prefer it over None.
        if path.exists() and path.stat().st_size > 0:
            logger.info("download_pdf: serving stale cache for %s", url)
            return path
        return None
    if r.status_code != 200 or not r.content:
        logger.warning("download_pdf: HTTP %s for %s", r.status_code, url)
        if path.exists() and path.stat().st_size > 0:
            return path  # serve stale rather than nothing
        return None
    if not r.content.startswith(b"%PDF"):
        logger.warning("download_pdf: not a PDF (got %r…) for %s", r.content[:8], url)
        return None
    path.write_bytes(r.content)
    return path


def _run_pdftotext(args: list[str], pdf_path: Path) -> Optional[str]:
    """Internal: invoke pdftotext with the given flags. Returns the text or
    None on failure. Errors are logged at WARNING — silent failure was the
    previous behavior and made debugging "0 ads" reports near-impossible.
    """
    if not has_pdftotext():
        logger.error("pdftotext not on PATH; install Poppler (`brew install poppler`)")
        return None
    cmd = [PDFTOTEXT, *args, str(pdf_path), "-"]
    try:
        out = subprocess.run(
            cmd, capture_output=True, text=True, check=True, timeout=120,
        )
        return out.stdout
    except subprocess.TimeoutExpired:
        logger.warning("pdftotext timed out (>120s) on %s", pdf_path.name)
    except subprocess.CalledProcessError as e:
        logger.warning(
            "pdftotext exited %d on %s: %s",
            e.returncode, pdf_path.name, (e.stderr or "")[:200],
        )
    except Exception as e:  # belt-and-suspenders — log unexpected
        logger.warning("pdftotext unexpected failure on %s: %s", pdf_path.name, e)
    return None


def extract_text(pdf_path: Path) -> Optional[str]:
    """Return the layout-preserved text of a PDF, or None on failure.

    Uses `pdftotext -layout`. Best for tabular rolling-ad PDFs where column
    alignment matters (most IIT/IIM PDFs).
    """
    return _run_pdftotext(["-layout"], pdf_path)


def extract_text_flow(pdf_path: Path) -> Optional[str]:
    """Return reading-order text of a PDF (no -layout flag). Useful when the
    layout extractor interleaves columns into gibberish — IIT Madras's
    annexure does this because the Eligibility and Areas columns are
    side-by-side and `pdftotext -layout` produces row-major output that
    mashes them.
    """
    return _run_pdftotext([], pdf_path)


def split_into_units_flow(text: str, dept_names: list[str]) -> dict[str, str]:
    """Split reading-order text into per-department blocks using a known list
    of department names as anchors. Returns {dept_name: body_text}.

    This is the fallback used when the layout-based splitter produces clean
    headers but its body content is column-mashed. We feed in the
    department-name list discovered by `split_into_units` and slice the
    flow-text on those names.
    """
    if not text or not dept_names:
        return {}
    # Match each name (case-insensitive) at the start of a line or after a digit
    # number standalone-on-a-line. The IITM PDF lays them out as `<num>\n<name>\n`.
    # Build a tolerant pattern: dept names may wrap across lines in flow text
    # (e.g. "Aerospace\nEngineering"). Replace each literal space in the name
    # with `\s+` so the regex matches across line breaks. Optional leading
    # number-on-a-line ("1\n").
    by_pos: list[tuple[int, str]] = []
    for name in dept_names:
        flexible = re.escape(name).replace(r"\ ", r"\s+")
        pattern = re.compile(
            r"(?:^|\n)\s*(?:\d{1,2}\s*\n\s*)?" + flexible + r"\s*\n",
            re.IGNORECASE,
        )
        m = pattern.search(text)
        if m:
            by_pos.append((m.end(), name))
    by_pos.sort()

    out: dict[str, str] = {}
    for i, (pos, name) in enumerate(by_pos):
        end = by_pos[i + 1][0] if i + 1 < len(by_pos) else len(text)
        body = text[pos:end].strip()
        if body:
            out[name] = body
    return out


# A unit-row header line: ^<spaces?><1-2 digits><≥2 spaces><Capitalised text...>
# where "rest" includes both the unit-name column and the areas column.
UNIT_HEADER_RE = re.compile(
    r"^(?P<indent>[ \t]*)(?P<num>\d{1,2})[ \t]{2,}(?P<rest>[A-Z][^\n]{2,400})$",
    re.MULTILINE,
)


def _split_name_from_areas(rest: str) -> str:
    """Isolate the unit-name column. The unit-name ends at the first ≥2-space
    gap before non-whitespace (which marks the start of the Areas column).
    """
    m = re.match(r"(.+?)[ \t]{2,}\S", rest)
    return (m.group(1) if m else rest).strip()


# A continuation line for a wrapped unit name. The fragment must be in the
# unit-name column (indented), and end either at a column boundary (2+ space
# gap before the next column) or at end-of-line. The non-greedy match prevents
# us from running off into the areas-of-specialization column.
NAME_CONT_RE = re.compile(r"^[ \t]{4,}([A-Za-z][\w &/(),.\-]{2,40}?)(?:[ \t]{2,}\S|[ \t]*$)")


def split_into_units(text: str) -> list[UnitBlock]:
    """Split a rolling-ad PDF's text into per-unit blocks.

    Strategy: find header lines, keep only those whose unit-number is
    monotonically increasing (filters spurious enumerations), then carve
    body text between adjacent kept headers. The unit name is the first
    column on the header line, possibly extended with continuation lines.
    """
    raw_matches = list(UNIT_HEADER_RE.finditer(text))
    if not raw_matches:
        return []

    # Drop TOC entries — lines that contain a *second* unit header on the same
    # line are two-column tables of contents, not annexure rows.
    TOC_DOUBLE = re.compile(r"\d{1,2}[ \t]{2,}[A-Z][^\n]{2,30}[ \t]{2,}\d{1,2}[ \t]{2,}[A-Z]")
    matches = []
    for m in raw_matches:
        line_start = text.rfind("\n", 0, m.start()) + 1
        line_end = text.find("\n", m.start())
        if line_end == -1:
            line_end = len(text)
        line = text[line_start:line_end]
        if TOC_DOUBLE.search(line):
            continue  # two unit headers on one line → TOC, skip
        matches.append(m)
    if not matches:
        return []

    # If a unit number appears more than once (e.g. once in another orphan line
    # and once at its real annexure start), keep the LAST occurrence — the
    # body content lives below the annexure header, not the TOC.
    by_num: dict[int, re.Match] = {}
    for m in matches:
        by_num[int(m.group("num"))] = m
    matches = sorted(by_num.values(), key=lambda x: x.start())

    kept: list[re.Match] = []
    last_num = 0
    for m in matches:
        num = int(m.group("num"))
        if last_num == 0 and num <= 3:
            kept.append(m); last_num = num
        elif num == last_num + 1:
            kept.append(m); last_num = num
        elif last_num < num <= last_num + 3:
            kept.append(m); last_num = num

    if not kept:
        return []

    blocks: list[UnitBlock] = []
    for i, m in enumerate(kept):
        start = m.start()
        end = kept[i + 1].start() if i + 1 < len(kept) else len(text)
        body = text[start:end].rstrip()
        name = _split_name_from_areas(m.group("rest"))

        # Determine the column where the name starts on the header line.
        # Name continuations are lines indented ~the same amount, with no
        # column-2 content. Areas-column lines are far more indented and get
        # skipped (not appended) but don't end the search.
        name_col = len(m.group("indent")) + len(m.group("num"))
        # find leading-spaces of "rest" by counting the gap in the original line
        line0 = text[m.start():text.find("\n", m.start()) if text.find("\n", m.start()) != -1 else end]
        gap_m = re.match(r"^\s*\d{1,2}(\s+)", line0)
        if gap_m:
            name_col += len(gap_m.group(1))

        body_lines = body.splitlines()
        # Look at up to NAME_CONTINUATION_LOOKBACK subsequent lines for
        # wrapped name fragments, tolerating areas-column text in between.
        gathered_after_break = False
        for j in range(1, min(NAME_CONTINUATION_LOOKBACK, len(body_lines))):
            line = body_lines[j]
            stripped = line.lstrip()
            if not stripped:
                continue
            indent = len(line) - len(stripped)
            # Indent must be within the unit-name column band (±4 spaces)
            in_name_col = abs(indent - name_col) <= 4
            if not in_name_col:
                gathered_after_break = True
                continue
            # On the name column. Capture up to first column boundary or EOL.
            frag_m = re.match(r"^([A-Za-z][\w &/(),.\-]{1,40}?)(?:[ \t]{2,}\S|[ \t]*$)", stripped)
            if not frag_m:
                # Looks like a body line at the name-column indent — stop.
                break
            frag = frag_m.group(1).strip()
            # Heuristic stops: a fragment that looks like a sentence start
            # (begins with capitalised verb-like word + lowercase stuff) is
            # probably content, not a name continuation.
            if len(frag.split()) > 6:
                break
            if gathered_after_break and len(name) > 60:
                # We've already crossed the gap once and have a long name —
                # don't keep stitching, we're probably past the unit.
                break
            name += " " + frag

        blocks.append(UnitBlock(
            unit_num=int(m.group("num")),
            unit_name=re.sub(r"\s+", " ", name).strip()[:UNIT_NAME_MAX_CHARS],
            text=body,
        ))
    return blocks


# Deadline-extraction strategy: find the keyword that signals a deadline
# context, allow the actual date string to spill across line breaks (PDFs
# wrap mid-sentence), then capture the date itself. Multiple regex
# variants cover the major surface forms across IIT/IIM rolling ads.
DEADLINE_RES = [
    re.compile(
        r"(?:application[s]?|complete[d]?\s+application|submitted)"
        r"[^\n]{0,300}?(?:on\s+or\s+before|deadline[:\s]+|last\s+date[^\n]{0,20}?)"
        r"\s+(?P<date>[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})",
        re.I | re.S,
    ),
    re.compile(
        r"(?:on\s+or\s+before|deadline\s+is|last\s+date\s+(?:for|of))"
        r"\s+(?P<date>[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})",
        re.I | re.S,
    ),
    re.compile(r"Application\s+Last\s+Date[^\d]{0,40}?(?P<date>\d{1,2}/\d{1,2}/\d{4})", re.I),
    re.compile(r"last\s+date[^\n]{0,40}?(?P<date>\d{1,2}[./-]\d{1,2}[./-]\d{2,4})", re.I),
    # "Last date for application: April 30, 2026" — month-name variant of the
    # numeric "Last date" pattern above; needed because some IIT/IIM ads write
    # the deadline with a word-month rather than digits.
    re.compile(
        r"last\s+date[^\n]{0,40}?(?P<date>[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})",
        re.I,
    ),
]


def find_deadline(text: str) -> Optional[str]:
    """Return the first deadline-string found in the text, or None.

    Pre-current-cycle dates are rejected as likely references to past cycles
    rather than the current call's deadline. The accepted-year floor is
    computed dynamically (max of `current_year - 1` and the hard floor in
    constants) so the parser doesn't quietly start dropping valid dates as
    the calendar advances — the previous hard-coded `< 2024` floor would
    have started rejecting valid 2024 deadlines in 2027.
    """
    floor_year = max(
        HARD_FLOOR_DEADLINE_YEAR,
        datetime.now(timezone.utc).year - 1,
    )
    text = re.sub(r"[ \t]+", " ", text)  # collapse intra-line whitespace; keep \n
    for r in DEADLINE_RES:
        for m in r.finditer(text):
            raw = m.group("date").strip()
            yr_m = re.search(r"(20\d{2})$", raw) or re.search(r"/(20\d{2})$", raw)
            if yr_m and int(yr_m.group(1)) < floor_year:
                continue
            return raw
    return None


# --- reservation extraction --------------------------------------------------
# Two surfaces for category data in Indian HEI rolling-ad PDFs:
#
#   (A) Per-position counts: a roster like "UR-2, SC-1, ST-1, OBC-3, EWS-1".
#       Common in NIT / Central-University ads; rarer in IITs.
#   (B) Institute-wide percentages: "SC-15%; ST-7.5%; OBC(NCL)-27%; EWS-10%;
#       PwBD-4%" — the standard CEI (Reservation in Teachers Cadre) Act 2019
#       text. This is what every IIT/IIM/IISER currently publishes.
#
# We extract (B) verbatim as a `reservation_note` because the percentage
# language is the legally-binding declaration; per-position counts (A) when
# present go into `category_breakdown`.

# Sentence-level capture of the reservation policy paragraph. Anchors on the
# canonical "extent of reservation" / "as follows: SC-15%" phrasing so we
# don't capture random pages.
RESERVATION_NOTE_RES = [
    re.compile(
        r"(?:extent of reservation[^\n]{0,40}?(?:as follows)?\s*[:\-]?\s*)?"
        r"(SC[-\s]\s*\d+(?:\.\d+)?%[^.\n]{0,200}"  # SC-15%, then a few segments
        r"(?:ST|OBC|EWS|PwBD|PwD|NCL)[^\n]{0,40}%)",
        re.I,
    ),
    # Looser: any line explicitly listing 3+ reservation categories with %s.
    re.compile(
        r"((?:SC|ST|OBC|EWS|PwBD|PwD)[-\s]\s*\d+(?:\.\d+)?%"
        r"(?:\s*[;,&]\s*(?:SC|ST|OBC|EWS|PwBD|PwD|NCL)[^\n]{0,30}%){2,})",
        re.I,
    ),
]


def find_reservation_note(text: str) -> Optional[str]:
    """Return the institute-wide reservation policy sentence if found.

    The CEI (RTC) Act 2019 mandates 15/7.5/27/10/4% spreads for
    SC/ST/OBC(NCL)/EWS/PwBD respectively, but PDFs phrase this in slightly
    different ways. Returned string is the captured run of category names
    + percentages, with whitespace collapsed for display.
    """
    text = re.sub(r"\s+", " ", text)
    for r in RESERVATION_NOTE_RES:
        m = r.search(text)
        if m:
            note = m.group(1).strip().rstrip(".,;")
            return note
    return None


# Per-position category counts: "UR-2 SC-1 ST-1 OBC-3 EWS-1 PwBD-1".
# Real ads use varied separators between category and number — ASCII hyphen,
# en-dash (–), em-dash (—), colon, plain whitespace. NC-OBC and
# OBC-NCL are both attested in central-government usage (IIM Bodh Gaya uses
# the NC-OBC form; IIT Madras uses OBC-NCL; treat as OBC after normalising).
CATEGORY_COUNT_RE = re.compile(
    r"\b(UR|GEN|NC[-\s]?OBC|OBC(?:[-\s]?NCL)?|SC|ST|EWS|PwBD|PwD)\s*[-:–—\s]\s*(\d+)\b",
    re.I,
)


def find_category_breakdown(text: str) -> Optional[dict]:
    """Return {UR, SC, ST, OBC, EWS, PwBD: int} if the text shows an explicit
    per-position roster. Returns None if no roster pattern is detected.

    We require at least 3 distinct categories with explicit counts in close
    proximity — fewer matches are usually false positives from prose ("at
    least 3 publications", "SC 5 papers"). Applies a 200-char locality
    window so a "SC: 1" mention on page 2 doesn't pair with an "ST: 1" on
    page 5.
    """
    text = re.sub(r"[ \t]+", " ", text)
    matches = list(CATEGORY_COUNT_RE.finditer(text))
    if len(matches) < 3:
        return None
    # Find the densest cluster — the position where ≥3 matches sit within
    # a 200-char window. That's the roster line; everything else is prose.
    best: Optional[dict] = None
    for i, m in enumerate(matches):
        window = (m.start(), m.start() + 200)
        cluster = [mm for mm in matches if window[0] <= mm.start() <= window[1]]
        if len(cluster) < 3:
            continue
        # Aggregate the cluster into a category dict
        out: dict = {}
        for mm in cluster:
            cat_raw = mm.group(1).upper().replace(" ", "").replace("-", "")
            # Normalise: GEN→UR, OBC variants (OBCNCL, NCOBC) → OBC, PwD→PwBD
            if cat_raw == "GEN":
                key = "UR"
            elif "OBC" in cat_raw:
                key = "OBC"
            elif cat_raw == "PWD" or cat_raw == "PWBD":
                key = "PwBD"
            else:
                key = cat_raw
            try:
                out[key] = int(mm.group(2))
            except ValueError:
                continue
        # Sanity check: no single category should be wildly larger than
        # plausible (>50). If it is, this isn't a roster.
        if any(v > 50 for v in out.values()):
            continue
        if len(out) >= 3 and (best is None or len(out) > len(best)):
            best = out
    return best


# --- general eligibility (institute-wide) ------------------------------------
# Pulls the PhD-and-experience preamble that almost every IIT PDF starts
# with under "QUALIFICATION & EXPERIENCE". We capture the paragraph after
# "Ph.D., with first class" because that's the canonical institute-wide
# requirement; per-unit eligibility lives elsewhere.
GENERAL_ELIGIBILITY_RES = [
    re.compile(
        r"(Ph\.?D\.?[^\n]{0,30}?(?:first class|equivalent)[^.\n]{20,400}\.)",
        re.I,
    ),
]


def find_general_eligibility(text: str) -> Optional[str]:
    """Return the institute-wide PhD-and-experience requirement sentence.

    This complements per-unit eligibility (which the splitter pulls from
    each unit-block); the general clause applies across all units of the
    same PDF (e.g. "Ph.D., with first class or equivalent in the preceding
    degree").
    """
    text = re.sub(r"\s+", " ", text)
    for r in GENERAL_ELIGIBILITY_RES:
        m = r.search(text)
        if m:
            return m.group(1).strip()
    return None


PUBS_RES = [
    re.compile(
        r"(minimum of\s+(?:THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|TEN|\d+)[^.]{10,400}?(?:journals?|publications?|conferences?)\.?)",
        re.I | re.S,
    ),
    re.compile(
        r"(at least\s+(?:THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|TEN|\d+)[^.]{10,400}?(?:journals?|publications?|conferences?)\.?)",
        re.I | re.S,
    ),
]


def find_publications(text: str) -> Optional[str]:
    matches: list[str] = []
    for r in PUBS_RES:
        for m in r.finditer(text):
            matches.append(re.sub(r"\s+", " ", m.group(1).strip()))
    if not matches:
        return None
    seen, dedup = set(), []
    for s in matches:
        if s in seen:
            continue
        seen.add(s)
        dedup.append(s)
    return " | ".join(dedup[:3])
