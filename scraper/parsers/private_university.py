"""Parser for private-university careers pages.

Private universities tend to publish HSS jobs in one of three shapes:
  - table-based portals (Shiv Nadar, FLAME)
  - card/list-based jobs pages (Azim Premji, Ashoka)
  - standing faculty-call pages (Ahmedabad, JGU)

This parser is intentionally permissive. For a public-interest tracker, a
coarse official listing is better than silence; the dashboard classifier and
source provenance make low-specificity entries visible to users.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

from bs4 import BeautifulSoup


JOB_HINT_RE = re.compile(
    r"\b(faculty|professor|lecturer|academic\s+associate|research\s+fellow|"
    r"research\s+positions?|post[- ]?doc|teaching\s+fellow|visiting\s+scholar)\b",
    re.I,
)
TITLE_RE = re.compile(
    r"\b((?:chair\s+)?(?:assistant|associate|visiting)?\s*professor(?:\s*(?:-|/|in)\s+[^.;|\\n]{2,160})?|"
    r"faculty\s+positions?\s+in\s+[^.;|\\n]{2,160}|"
    r"teaching\s+fellow\s+positions?|research\s+positions?|academic\s+associate)\b",
    re.I,
)

SKIP_RE = re.compile(
    r"\b(admission|student|placement|alumni|newsletter|programme|program\b|"
    r"job\s+opportunities|apply\s+now\s*$|explore\s+opportunities\s*$)\b",
    re.I,
)
NAV_RE = re.compile(r"^\s*(home|jobs|about us|contact us|www\.|https?://|[\w.%-]+@[\w.-]+)\s*$", re.I)

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

DATE_RES = [
    re.compile(r"(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(?P<day>\d{1,2}),?\s+(?P<year>20\d{2})", re.I),
    re.compile(r"(?P<day>\d{1,2})\s+(?P<mon>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*,?\s+(?P<year>20\d{2})", re.I),
    re.compile(r"(?P<day>\d{1,2})[./-](?P<mon>\d{1,2})[./-](?P<year>20\d{2})"),
]


def _stable_id(*parts: str) -> str:
    m = hashlib.sha256()
    for p in parts:
        m.update((p or "").encode("utf-8"))
        m.update(b"\x00")
    return m.hexdigest()[:16]


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _parse_date(text: str) -> Optional[str]:
    if not text or re.search(r"\bopen\b", text, re.I):
        return None
    for r in DATE_RES:
        m = r.search(text)
        if not m:
            continue
        gd = m.groupdict()
        mon_raw = gd["mon"]
        mon = int(mon_raw) if mon_raw.isdigit() else MONTHS.get(mon_raw[:3].lower())
        if not mon:
            continue
        day = int(gd["day"])
        year = int(gd["year"])
        if 1 <= day <= 31 and 1 <= mon <= 12:
            return f"{year:04d}-{mon:02d}-{day:02d}"
    return None


def _title_from_text(text: str) -> str:
    m = TITLE_RE.search(text or "")
    if m:
        title = _clean(m.group(1))
        title = re.split(r"\s+(?:Know More|Apply Now|Click here|The selected candidate|position requires)\b", title, flags=re.I)[0]
        return title.rstrip(" ,:-")
    first = re.split(r"\s{2,}| Deadline | Campus | Location ", text or "")[0]
    return _clean(first)


def _post_type(title: str) -> str:
    t = title.lower()
    if "academic associate" in t:
        return "Research"
    if "research" in t or "postdoc" in t or "fellow" in t:
        return "Research"
    if "faculty" in t or "professor" in t or "lecturer" in t or "teaching" in t:
        return "Faculty"
    return "Unknown"


def _contract(title: str) -> str:
    t = title.lower()
    if "visiting" in t:
        return "Visiting"
    if "contract" in t:
        return "Contractual"
    if "teaching fellow" in t or "academic associate" in t:
        return "Contractual"
    return "TenureTrack" if re.search(r"\b(professor|faculty)\b", t) else "Unknown"


def _make_ad(title: str, url: str, fetched_at: datetime, excerpt: str,
             closing: Optional[str] = None, apply_url: Optional[str] = None,
             confidence: float = 0.55, excerpt_cap: int = 700) -> dict:
    title = _clean(title)[:220]
    # Default 700-char cap is defensive for index-page extracts that
    # may include cross-listing noise. Parsers with structured per-position
    # bodies (FLAME, APU per-position, ...) can pass a larger cap so the
    # full hiring brief survives into the dashboard.
    excerpt = _clean(excerpt)[:excerpt_cap]
    return {
        "id": _stable_id("private", url, title, closing or ""),
        "institution_id": "__placeholder__",
        "ad_number": None,
        "title": title,
        "department": None,
        "discipline": None,
        "post_type": _post_type(title),
        "contract_status": _contract(title),
        "category_breakdown": None,
        "number_of_posts": None,
        "pay_scale": None,
        "publication_date": None,
        "closing_date": closing,
        "original_url": url,
        "snapshot_fetched_at": fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else str(fetched_at),
        "parse_confidence": confidence,
        "raw_text_excerpt": excerpt,
        "apply_url": apply_url,
        "info_url": url,
        "_private_university": True,
    }


def _row_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    for tr in soup.find_all("tr"):
        cells = [_clean(td.get_text(" ", strip=True)) for td in tr.find_all(["td", "th"])]
        row_text = _clean(" | ".join(cells))
        if not JOB_HINT_RE.search(row_text) or SKIP_RE.search(row_text):
            continue
        title = next(
            (
                c for c in cells
                if 8 <= len(c) <= 190 and JOB_HINT_RE.search(c) and not NAV_RE.search(c) and not SKIP_RE.search(c)
            ),
            "",
        ) or _title_from_text(row_text)
        if NAV_RE.search(title):
            continue
        closing = _parse_date(row_text)
        link = tr.find("a", href=True)
        apply_url = urljoin(base_url, link["href"]) if link else None
        ads.append(_make_ad(title, base_url, fetched_at, row_text, closing, apply_url, 0.65))
    return ads


def _block_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    seen: set[str] = set()
    selectors = ["article", "li", ".job", ".card", ".views-row", ".opportunity", "section"]
    for node in soup.select(",".join(selectors)):
        text = _clean(node.get_text(" ", strip=True))
        if len(text) < 20 or not JOB_HINT_RE.search(text) or SKIP_RE.search(text):
            continue
        heading = node.find(["h1", "h2", "h3", "h4", "strong"])
        title = _clean(heading.get_text(" ", strip=True)) if heading else ""
        if not title or not JOB_HINT_RE.search(title):
            # Fall back to the first sentence-ish chunk.
            title = _title_from_text(text)
        if SKIP_RE.search(title):
            continue
        if len(title) < 8 or NAV_RE.search(title):
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        link = node.find("a", href=True)
        apply_url = urljoin(base_url, link["href"]) if link else None
        closing = _parse_date(text)
        ads.append(_make_ad(title, base_url, fetched_at, text, closing, apply_url, 0.55))
    return ads


def _link_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    seen: set[str] = set()
    for a in soup.find_all("a", href=True):
        if a["href"].strip() == "#":
            continue
        text = _clean(a.get_text(" ", strip=True))
        parent = _clean(a.parent.get_text(" ", strip=True) if a.parent else text)
        hay = f"{text} {parent}"
        if not JOB_HINT_RE.search(hay) or SKIP_RE.search(hay):
            continue
        title = parent if len(parent) < 220 and JOB_HINT_RE.search(parent) else text
        title = _title_from_text(title)
        if SKIP_RE.search(title):
            continue
        if len(title) < 8 or NAV_RE.search(title):
            continue
        href = urljoin(base_url, a["href"])
        key = f"{title.lower()} {href}"
        if key in seen:
            continue
        seen.add(key)
        ads.append(_make_ad(title, href, fetched_at, parent, _parse_date(parent), href, 0.5))
    return ads


# FLAME-specific helpers. Each position lives inside its own <table> on
# jobs.flame.edu.in/FLAME_Current_Jobs_page; there are no per-position
# URLs. Default tr-based parsing flattens 87 tables into one body and
# the institutional pitch eats the position-specific content. This
# extracts per-table.

# Phrases that mark the start of position-specific content. Tried in
# order; the first match wins. Captures (title) where possible.
_FLAME_INVITE_PATTERNS = [
    # "We are inviting applications [from X] for [the positions of] [full-time] TITLE."
    re.compile(
        r"\b(?:we\s+(?:are\s+)?invit(?:e|ing)|is\s+inviting|are\s+invited|are\s+looking)"
        r"(?:\s+applications?)?"
        r"(?:\s+from\s+[^.]{0,150}?)?"
        r"\s+for\s+"
        r"(?:the\s+)?(?:positions?\s+of\s+)?(?:a\s+)?(?:full[- ]time\s+)?"
        r"([^.]{3,180})\.",
        re.I,
    ),
    # "We welcome applications from all subfields of TITLE"
    re.compile(
        r"\bwe\s+welcome\s+applications?\s+from\s+(?:all\s+subfields\s+of\s+)?([^.]{3,160})\.",
        re.I,
    ),
]

# End markers — position content ends here.
_FLAME_END_RE = re.compile(
    r"\b(?:To know more about our|For informal enquiries|"
    r"FLAME University is an affirmative)\b",
    re.I,
)


def _flame_clean_title(raw: str) -> str:
    """Strip filler from a FLAME title capture."""
    t = raw.strip()
    t = re.sub(r"^(?:the\s+|full[- ]time\s+|positions?\s+of\s+|a\s+)+", "", t, flags=re.I)
    t = re.sub(r"\s+positions?$", "", t, flags=re.I)
    # Trailing junk like "While we welcome..." sometimes leaks via greedy
    # capture; cut at the first sentence-ish break.
    t = re.split(r"\s+(?:While|Faculty|We are|The selected|Endowed|This|Candidates)\b", t, flags=re.I)[0]
    return _clean(t).rstrip(",.;: ")


def _flame_table_ad(table, base_url: str, fetched_at: datetime) -> Optional[dict]:
    """Build one JobAd dict from one FLAME <table>. None if no position
    marker can be found — caller can fall back to default parsing."""
    text = _clean(table.get_text(" ", strip=True))
    if len(text) < 200:
        return None
    invite_m = None
    for p in _FLAME_INVITE_PATTERNS:
        invite_m = p.search(text)
        if invite_m:
            break
    if not invite_m:
        return None
    title = _flame_clean_title(invite_m.group(1) if invite_m.groups() else "")
    if len(title) < 5:
        return None
    # Body: from the invite marker through to the end-marker (or table end).
    pos_start = invite_m.start()
    body = text[pos_start:]
    end_m = _FLAME_END_RE.search(body)
    if end_m:
        body = body[: end_m.start()]
    body = _clean(body)
    # School/Faculty extraction. The boilerplate above the position body
    # usually says "School of X" or "Faculty of Y" — that's where the
    # institutional unit lives. Capture the prefix verbatim ("School of
    # Liberal Education", "Faculty of Communication") so cardDiscipline
    # in the dashboard recognises it as a proper unit and renders as
    # "School of Liberal Education — Public Policy".
    dept_m = re.search(
        r"\b((?:Faculty|School)\s+of\s+"
        r"[A-Z][\w\s&]{2,40}?)"
        r"(?=\s+(?:at\s+FLAME|has\s+|stands\s+|is\s+|offers?\s+|in\s+the\s+areas|—|invites?\s+))",
        text,
    )
    department = _clean(dept_m.group(1)).rstrip(",.;& ") if dept_m else None

    # Discipline: the title is "[rank] in [discipline]". Pulling
    # discipline out as a separate field lets the dashboard render
    # "Assistant Prof., Public Policy" rather than echoing the title
    # twice (rank-line + title-line both saying "in Public Policy").
    discipline = None
    disc_m = re.match(
        r"(?:Chair\s+)?(?:Assistant|Associate|Visiting|Adjunct)?\s*"
        r"(?:Distinguished\s+)?Professor"
        r"(?:\s+of\s+Practice)?"
        r"\s+in\s+(?:all\s+areas\s+of\s+)?(.+?)$",
        title, re.I,
    )
    if disc_m:
        discipline = _clean(disc_m.group(1)).rstrip(" ,.;:")
        # "Visual Communication position" → drop trailing "position"
        discipline = re.sub(r"\s+positions?$", "", discipline, flags=re.I).strip()

    closing = _parse_date(body)
    # FLAME bodies are structured (boilerplate stripped, position-specific
    # only). Allow a longer excerpt so the full hiring brief survives —
    # candidates need the area-of-specialisation language and the
    # qualifications statement to decide whether to apply.
    ad = _make_ad(title, base_url, fetched_at, body, closing, base_url, 0.72, excerpt_cap=2400)
    if department:
        ad["department"] = department[:120]
    if discipline:
        ad["discipline"] = discipline[:120]
    return ad


def _flame_ads(soup: BeautifulSoup, base_url: str, fetched_at: datetime) -> list[dict]:
    ads: list[dict] = []
    seen_titles: set[str] = set()
    for table in soup.find_all("table"):
        ad = _flame_table_ad(table, base_url, fetched_at)
        if not ad:
            continue
        key = ad["title"].casefold()
        if key in seen_titles:
            continue
        seen_titles.add(key)
        ads.append(ad)
    return ads


# APU per-position parsing. The careers index lists positions as
# /jobs/{slug} links; each link goes to a detail page with H3 sections
# for Requirements, Application Procedure, Resources. The previous
# parser only saw the index page so every APU card showed only a
# truncated opening sentence. This branch follows each per-position
# URL to extract the full hiring brief, requirements bullets, and
# application instructions.

# Skip-list: index URLs that aren't actual positions.
_APU_NON_POSITION_RE = re.compile(
    r"/jobs/(?:index|at:|role:|location:|department:|category:)|\.ics$",
    re.I,
)


def _apu_position_ad(html: str, url: str, fetched_at: datetime,
                     closing: Optional[str] = None) -> Optional[dict]:
    """Parse one APU per-position page into a JobAd dict.

    `closing` is passed in by the caller because APU exposes the
    deadline only in the *index* card's "Add to Calendar" block, not
    on the per-position detail page. The detail page handles the
    narrative + requirements + application procedure; the index card
    handles the deadline + campus.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    # APU pages have a first <h1> that wraps the logo (empty text);
    # the real position title is the next non-empty <h1>. Pick the
    # first H1 with content.
    title = ""
    for h in soup.find_all("h1"):
        candidate = _clean(h.get_text(" ", strip=True))
        if candidate:
            title = candidate
            break
    if not title or "page not found" in title.lower():
        return None

    # Meta description carries the 1-line summary, e.g. "We invite
    # applications for faculty positions in Biology, specializing in
    # Ecology, Evolutionary Biology and/or Biodiversity Conservation
    # for our Undergraduate Programmes." Useful as the excerpt's
    # opening anchor.
    meta_desc = soup.find("meta", attrs={"name": "description"})
    summary = _clean(meta_desc.get("content", "")) if meta_desc else ""

    # Discipline focus narrative: "We are particularly interested in
    # scholars trained in [list]…" — captures the discipline focus of
    # the call. Often in a paragraph elsewhere on the page; pull any
    # paragraph containing one of these intro phrases.
    narrative_parts: list[str] = []
    intro_re = re.compile(
        r"\bWe (?:are particularly interested|invite applications|welcome applicants?)\b",
        re.I,
    )
    for p in soup.find_all("p"):
        ptxt = _clean(p.get_text(" ", strip=True))
        if ptxt and intro_re.search(ptxt):
            narrative_parts.append(ptxt)
    narrative = " ".join(narrative_parts)

    # Section extraction: each H3 sits inside <label class="toggle-trigger">
    # which lives in a <section class="container-prose stack ...">. The
    # section text contains the H3 label + the body bullets. We strip
    # the label from the body.
    def section_for(heading: str) -> str:
        for h in soup.find_all(["h2", "h3"]):
            if heading.casefold() in h.get_text(" ", strip=True).casefold():
                section = h.find_parent("section")
                if not section:
                    continue
                section_text = _clean(section.get_text(" ", strip=True))
                # Strip the heading text from the start
                return _clean(re.sub(rf"^{re.escape(heading)}\b\s*", "", section_text, flags=re.I))
        return ""

    requirements = section_for("Requirements")
    application = section_for("Application Procedure")

    # Build a rich excerpt from all the parts that survived.
    excerpt_parts = [s for s in [summary, narrative, requirements, application] if s]
    excerpt = " — ".join(excerpt_parts)

    # Discipline from the title: "Faculty Positions in <X>" → <X>.
    discipline = None
    disc_m = re.match(r"Faculty\s+Positions?\s+(?:for|in)\s+(.+?)$", title, re.I)
    if disc_m:
        discipline = _clean(disc_m.group(1)).rstrip(" ,.;:")

    # Confidence: APU per-position pages have stable structure and we
    # capture title + narrative + requirements + application. 0.85 is
    # well above the 0.55 the index-only parser produces.
    ad = _make_ad(title, url, fetched_at, excerpt, closing, url, 0.85, excerpt_cap=2400)
    if requirements:
        ad["unit_eligibility"] = requirements[:600]
    if discipline:
        ad["discipline"] = discipline[:120]
    return ad


def _apu_ads(
    soup: BeautifulSoup, base_url: str, fetched_at: datetime,
    fetch_position: Optional[callable] = None,
) -> list[dict]:
    """Parse the APU index, then follow each per-position link.

    `fetch_position(url)` is injected by `parse()` so contract tests
    can stub the network. By default it resolves to scraper-side
    `fetch.fetch()` which honours the cache + rate-limit + robots.
    """
    if fetch_position is None:
        # Lazy import — keeps unit tests stub-able without dragging in
        # the network module at import time.
        try:
            from fetch import fetch as _real_fetch  # type: ignore
        except ImportError:
            return []  # No network; can't follow per-position links.
        from pathlib import Path as _Path
        cache_dir = _Path(__file__).resolve().parents[2] / ".cache"
        # APU's robots.txt blocks /jobs paths; the orchestrator already
        # applies a public-interest override when it fetches the index.
        # Per-position URLs on the same domain are within that override
        # scope, so respect_robots=False here as well. If the index was
        # blocked AND the orchestrator chose not to override, this code
        # path won't be reached because the orchestrator carries forward
        # the previous run's data on a robots-blocked outcome.
        def fetch_position(u):  # noqa: E306
            r = _real_fetch(u, cache_path=cache_dir, respect_robots=False)
            return r.text or ""

    ads: list[dict] = []
    seen_urls: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"]).split("#")[0].rstrip("/")
        # Only follow APU /jobs/{slug} URLs that look like positions
        if "azimpremjiuniversity.edu.in" not in href:
            continue
        if not re.search(r"/jobs/[a-z0-9-]+$", href, re.I):
            continue
        if _APU_NON_POSITION_RE.search(href):
            continue
        if href in seen_urls:
            continue
        seen_urls.add(href)
        # Extract the deadline from the <article> wrapping this link.
        # APU's per-position detail page does not show a deadline
        # anywhere visible; only the index card carries it (in the
        # iCal "Add to Calendar" block). So pull the date now while
        # we still have the index DOM.
        closing = None
        article = a.find_parent("article")
        if article:
            closing = _parse_date(_clean(article.get_text(" ", strip=True)))
        try:
            html = fetch_position(href)
        except Exception:
            continue
        if not html or len(html) < 1000:
            continue
        ad = _apu_position_ad(html, href, fetched_at, closing=closing)
        if ad:
            ads.append(ad)
    return ads


def parse(html: str, url: str, fetched_at: datetime) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    page_text = _clean(soup.get_text(" ", strip=True))
    if "ahduni.edu.in" in url:
        ad = _make_ad(
            "Standing faculty recruitment - Ahmedabad University",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.45,
        )
        ad["_rolling_stub"] = True
        ad["_source_method"] = "curated rolling call"
        return [ad]

    if "krea.edu.in" in url:
        ad = _make_ad(
            "Faculty - SIAS, 2025-26",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.4,
        )
        ad["_rolling_stub"] = True
        ad["_source_method"] = "curated rolling call"
        return [ad]

    if "ashoka.edu.in" in url:
        parsed_ads = [*_block_ads(soup, url, fetched_at), *_link_ads(soup, url, fetched_at)]
    elif "flame.edu.in" in url:
        # FLAME packs each position into its own <table> with no per-position
        # URL. Use the table-aware extractor; fall back to the row-based one
        # if it returns nothing (e.g., site rewrites the layout).
        parsed_ads = _flame_ads(soup, url, fetched_at)
        if not parsed_ads:
            parsed_ads = _row_ads(soup, url, fetched_at)
    elif "azimpremjiuniversity.edu.in" in url:
        # APU exposes a /jobs/role:faculty index that links to per-position
        # pages. Follow each link, parse the H3 sections (Requirements,
        # Application Procedure) for the rich hiring brief.
        parsed_ads = _apu_ads(soup, url, fetched_at)
        if not parsed_ads:
            # Fall back to coarse block/link parsing on the index alone.
            parsed_ads = _block_ads(soup, url, fetched_at)
    else:
        parsed_ads = _row_ads(soup, url, fetched_at)
    if not parsed_ads:
        parsed_ads = _block_ads(soup, url, fetched_at)
    if not parsed_ads:
        parsed_ads = _link_ads(soup, url, fetched_at)

    ads: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for ad in parsed_ads:
        if "flame.edu.in" in url and (ad.get("title") or "").casefold() in {
            "professor", "associate professor", "assistant professor"
        }:
            continue
        key = ((ad.get("title") or "").casefold(), "")
        if key in seen:
            continue
        seen.add(key)
        ads.append(ad)

    # Standing faculty-call fallback for pages that are clearly faculty hiring
    # sources but do not expose a machine-friendly job list.
    if not ads and JOB_HINT_RE.search(page_text):
        ads.append(_make_ad(
            "Standing faculty recruitment / careers page",
            url,
            fetched_at,
            page_text,
            None,
            url,
            0.4,
        ))
        ads[-1]["_rolling_stub"] = True
        ads[-1]["_source_method"] = "curated rolling call"

    return ads[:80]
