"""Enrich docs/data/current.json with substantive PDF text per ad.

Why this exists:
  The HTML scraper for many institutions captures only 5 sentences of
  marketing copy ("We invite applications for faculty positions in
  History...") because the actual hiring criteria — sub-areas,
  methods preference, qualifications, evaluation — sit in the
  notification PDF the ad links to. Codex's pipeline (build_job_pdf
  _corpus.py + corpus_index.py) caches those PDFs and extracts/chunks
  their text. This script bridges that local-only corpus into the
  ad records the static dashboard reads, so cards stop displaying
  empty boilerplate.

Inputs:
  - docs/data/current.json                      (the live ad records)
  - .cache/job-ad-pdfs/manifest.jsonl           (PDF -> ad_id mapping)
  - corpus/job_ads_index/chunks.jsonl           (PDF -> chunked text)

Outputs:
  - docs/data/current.json                      (in place; adds pdf_excerpt
                                                 + pdf_source_url per ad)

Selection heuristic:
  For each PDF, score chunks by substantive-keyword density (areas of
  specialisation, qualifications, eligibility, publications, etc.) and
  drop low-content chunks (Devanagari address blocks, "Page X of Y"
  rows, single-line salary tables). Pick up to 3 highest-scoring
  chunks, concatenate, cap at 1800 chars. The dashboard's existing
  cue-extraction parser (extractCardCues) reads this richer text and
  produces meaningful Research areas / Methods / Approach output.

Run:
  python scripts/enrich_current_with_pdf.py [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURRENT_JSON = ROOT / "docs" / "data" / "current.json"
MANIFEST = ROOT / ".cache" / "job-ad-pdfs" / "manifest.jsonl"
CHUNKS = ROOT / "corpus" / "job_ads_index" / "chunks.jsonl"

# High-signal phrases that indicate substantive job content (areas the
# institution is hiring for, eligibility, qualifications, evaluation
# criteria). Mirrors the dashboard's SUBSTANTIVE_MARKERS regex.
SUBSTANTIVE = re.compile(
    r"\b("
    r"areas?\s+of\s+(?:specialization|specialisation|recruitment|research)"
    r"|specific\s+areas?\s+of"
    r"|following\s+(?:areas?|specializations?|disciplines?)"
    r"|qualifications?\s+(?:and|&)\s+experience"
    r"|qualifications?\s+required"
    r"|essential\s+qualifications?"
    r"|desirable\s+qualifications?"
    r"|eligibilit(?:y|ies)"
    r"|publication\s+(?:requirements?|record)"
    r"|teaching\s+(?:experience|requirements?|load)"
    r"|research\s+(?:experience|interests?|focus|expertise)"
    r"|sanctioned\s+(?:strength|posts?)"
    r"|number\s+of\s+(?:posts?|positions?|vacancies?)"
    r"|departments?\s+(?:of|for)\b[^.]{3,80}\b(?:invites?|requires?|seeks?)"
    r"|invites?\s+applications?"
    r"|applications?\s+are\s+invited"
    r"|applications?\s+are\s+being\s+invited"
    r"|department[\s-]+wise\s+area"
    r"|broad\s+areas?"
    r"|specialization"
    r"|specialisation"
    r"|methods?:"
    r"|methodolog(?:y|ies)"
    r"|ethnograph(?:ic|y)"
    r"|quantitative"
    r"|qualitative"
    r"|evaluation\s+criteria"
    r")\b",
    re.IGNORECASE,
)

# Junk patterns we don't want to show on a card.
JUNK = re.compile(
    r"^\s*(?:Page\s+\d+\s+of\s+\d+|"
    r"Annexure\s+[A-Z]?|"
    r"Sr[\.\s]+No|"
    r"Advertisement\s+No[:.]|"
    r"Notification\s+No[:.])",
    re.IGNORECASE,
)
DEVANAGARI = re.compile(r"[ऀ-ॿঀ-৿஀-௿ಀ-೿඀-෿]")


def chunk_score(text: str) -> int:
    """Higher = more substantive."""
    if len(text) < 100:
        return 0
    if JUNK.match(text.strip()):
        return 0
    # Heavy Devanagari/regional-script content usually = institution
    # address block, not job content.
    deva_chars = len(DEVANAGARI.findall(text))
    if deva_chars > 0.15 * len(text):
        return 0
    return len(SUBSTANTIVE.findall(text))


def normalise_url(u: str) -> str:
    """Manifest URLs and ad URLs sometimes differ in trailing slashes,
    case in the host, or a query suffix. Normalise so a join works."""
    if not u:
        return ""
    u = u.strip().rstrip("/")
    u = re.sub(r"^https?://", "", u, flags=re.IGNORECASE)
    return u.lower()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Print stats and don't write current.json")
    args = parser.parse_args()

    if not CURRENT_JSON.exists():
        print(f"ERROR: {CURRENT_JSON} not found", file=sys.stderr)
        return 1
    if not MANIFEST.exists():
        print(f"ERROR: {MANIFEST} not found — run scripts/build_job_pdf_corpus.py first",
              file=sys.stderr)
        return 1
    if not CHUNKS.exists():
        print(f"ERROR: {CHUNKS} not found — run scripts/corpus_index.py build first",
              file=sys.stderr)
        return 1

    # ---- Load manifest: pdf filename -> {refs, source_url} -------------
    # Keep the full reference dicts (ad_id + title + field) per PDF, not
    # just ad_ids — we need the per-ad title to filter chunks by
    # department in the multi-ad-per-PDF case below.
    pdf_to_refs: dict[str, list[dict]] = defaultdict(list)
    pdf_to_url: dict[str, str] = {}
    url_to_pdf: dict[str, str] = {}
    for line in MANIFEST.read_text().splitlines():
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        fname = entry.get("filename", "")
        url = entry.get("url", "")
        if not fname:
            continue
        pdf_to_url[fname] = url
        # Don't index empty/missing URLs — manifest entries from manual
        # local-PDF imports have url="" and would otherwise turn into a
        # `url_to_pdf[""] = <random PDF>` collision that matches every
        # ad with a null annexure_pdf_url to the wrong source.
        n = normalise_url(url)
        if n:
            url_to_pdf[n] = fname
        for ref in entry.get("references", []):
            if ref.get("ad_id"):
                pdf_to_refs[fname].append(ref)

    print(f"manifest: {len(pdf_to_refs)} unique PDFs covering "
          f"{sum(len(v) for v in pdf_to_refs.values())} ad references")

    # ---- Load chunks: pdf filename -> [chunks] -------------------------
    pdf_to_chunks: dict[str, list[dict]] = defaultdict(list)
    for line in CHUNKS.read_text().splitlines():
        if not line.strip():
            continue
        try:
            chunk = json.loads(line)
        except json.JSONDecodeError:
            continue
        pdf_to_chunks[chunk["pdf"]].append(chunk)

    print(f"chunks: {sum(len(v) for v in pdf_to_chunks.values())} chunks across "
          f"{len(pdf_to_chunks)} PDFs")

    # ---- Inject into current.json with per-department chunk filter -----
    # For each ad referenced by a PDF, build a small set of keywords
    # from the ad's discipline/department/title, filter the PDF's
    # chunks to those that mention any keyword, and pick the top-3 by
    # substantive-keyword density. This means a multi-department PDF
    # (an IIT rolling advertisement covering 24 departments) gets
    # different content per ad — Sociology ad gets the Sociology
    # paragraph, Aerospace ad gets the Aerospace paragraph, etc.
    # When filtering doesn't yield enough chunks (the department isn't
    # mentioned in the chunked text), we fall back to the top-3
    # whole-PDF chunks so the ad still gets some real content.

    data = json.loads(CURRENT_JSON.read_text())
    ads = data.get("ads", [])
    ads_by_id = {a["id"]: a for a in ads if a.get("id")}

    def keywords_for_ad(ad: dict) -> list[str]:
        kws: list[str] = []
        for k in ("discipline", "department"):
            v = (ad.get(k) or "").strip()
            if v and len(v) >= 3:
                kws.append(v.lower())
        title = (ad.get("title") or "").strip()
        # "Faculty — <Dept>" or "Faculty Positions in <Dept>"
        m = re.search(r"(?:Faculty|Position[s]?|Recruitment)[\s—–-]+([A-Za-z][A-Za-z &/-]{2,40})", title, re.I)
        if m:
            kws.append(m.group(1).strip().lower().rstrip(".,"))
        m = re.search(r"\bin\s+([A-Z][A-Za-z &/-]{2,40})", title)
        if m:
            kws.append(m.group(1).strip().lower().rstrip(".,"))
        # Strip exact-duplicate keywords; sub-strings stay (the broader
        # one helps catch more chunks).
        seen = set()
        out = []
        for k in kws:
            if k in seen:
                continue
            seen.add(k)
            out.append(k)
        return out

    # ---- Section-aware extraction --------------------------------------
    # Many institutional PDFs (IITs especially) bundle multiple
    # departments into one rolling advertisement, with each department
    # marked by a "Discipline: Applications…" header. Chunk-based picking
    # crosses these boundaries — a chunk from the Sociology section can
    # leak into the Literature ad's display.
    #
    # parse_pdf_sections returns a {section_name: text} map by finding
    # every "Discipline: <trigger>" header and slicing text between
    # consecutive headers. The trigger words (Applications / Applicants /
    # Candidates / etc.) are conservative — we want to match "Sociology:
    # Applications for Assistant Professor…" but NOT "Publication Record:"
    # or "Academic Background:".
    SECTION_HEADER_RE = re.compile(
        r"(?:^|\n|\. )([A-Z][a-zA-Z][a-zA-Z &/.-]{2,40}):"
        r"\s+(?=Application|Applicant|Candidate|We\s+invite|Faculty|Position|"
        r"Departments?\s+of|The\s+(?:School|Centre|Department))",
    )
    HEADER_BLACKLIST = {
        "publication record", "publications", "academic background", "academic qualification",
        "additional", "other", "general", "note", "page", "annexure", "department of",
        "for grade-i", "for grade-ii", "teaching", "phd guidance", "sponsored r&d",
        "submission and deadline", "awards and recognition", "grade-i", "grade-ii",
        "essential qualifications", "desirable qualifications",
    }

    # Patterns that signal we've crossed into ANOTHER section even though
    # SECTION_HEADER_RE didn't catch it. This is necessary because the
    # PDF chunker can bleed content across page breaks — the Psychology
    # section may end without a clean next-discipline header but does
    # have a "Department of X" or numbered "13 Department" or bullet
    # point that introduces unrelated content. Truncate at the first
    # such marker so the section text stays within its real boundary.
    SECTION_BLEED_RE = re.compile(
        r"(?:"
        r"\b\d{1,2}\s+Department\s+(?:of|Of)\s+|"
        r"\bAcademic\s+[Bb]ackground:|"
        r"\bPublication\s+Record:|"
        # Bullet-introducing-section: a • or –-style bullet followed by an
        # uppercase phrase ending with ':' is the start of a different
        # subsection (Materials, Computational, etc.). Note: dropping \b
        # because • is non-word and \b would never match before it.
        r"[•●]\s+[A-Z][A-Za-z][\w\s,&-]{2,40}:|"
        r"Page\s+\d+\s+of\s+\d+|"
        # IIT-style table column headers we don't want to bleed into
        r"\bResearch\s+Areas?\b\s*:?\s*[A-Z]"
        r")"
    )
    SECTION_HARD_CAP = 1000  # safety cap; one IIT-style section is ~400-600 chars

    def parse_pdf_sections(full_text: str) -> dict[str, str]:
        text = full_text
        sections: dict[str, str] = {}
        matches = list(SECTION_HEADER_RE.finditer(text))
        if not matches:
            return sections
        for i, m in enumerate(matches):
            name = m.group(1).strip().rstrip(".")
            if name.lower() in HEADER_BLACKLIST:
                continue
            start = m.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            # Bleed truncation: the chunker can run sections together when
            # PDF pages don't have clean headers. Cut at the first marker
            # that signals a different section (Page break, Department of X,
            # Academic Background:, Publication Record:, etc.).
            bleed = SECTION_BLEED_RE.search(body)
            if bleed:
                body = body[:bleed.start()].strip()
            # Hard cap as a final safety net
            if len(body) > SECTION_HARD_CAP:
                body = body[:SECTION_HARD_CAP].rsplit(" ", 1)[0] + "…"
            if len(body) < 40:
                continue
            # Compose with the header so the discipline name shows on the card
            sections[name.lower()] = f"{name}: {body}"
        return sections

    # Build full PDF text + sections per PDF
    pdf_to_full_text: dict[str, str] = {}
    pdf_to_sections: dict[str, dict[str, str]] = {}
    for pdf, chunks in pdf_to_chunks.items():
        # Concatenate chunks in document order
        ordered = sorted(chunks, key=lambda c: c["idx"])
        full = "\n\n".join(c["text"] for c in ordered)
        pdf_to_full_text[pdf] = full
        pdf_to_sections[pdf] = parse_pdf_sections(full)

    def section_for_ad(ad: dict, sections: dict[str, str]) -> str | None:
        # Try discipline first (most specific), then department, then
        # any keyword that looks like a section name.
        candidates: list[str] = []
        for k in ("discipline", "department"):
            v = (ad.get(k) or "").strip()
            if v:
                candidates.append(v.lower())
        # Title-derived: "Faculty — <Dept> — <Sub>"
        title = (ad.get("title") or "").strip()
        for part in re.split(r"\s+[—–-]\s+", title):
            part = part.strip().lower()
            if part and len(part) >= 3 and not part.startswith("faculty"):
                candidates.append(part)
        # Match candidates to section names (exact then substring)
        for c in candidates:
            if c in sections:
                return sections[c]
        for c in candidates:
            for sec_name, body in sections.items():
                # Normalize for hyphen/space variants
                if c == sec_name:
                    return body
                if c.replace("-", " ") == sec_name.replace("-", " "):
                    return body
        return None

    def pick_chunks(chunks: list[dict], keywords: list[str]) -> list[dict]:
        if not chunks:
            return []
        # Strict path: chunks where the department keyword appears in the
        # FIRST ~80 chars — i.e., the chunk is headed by that department's
        # section. This avoids the contamination that happens when a
        # multi-department PDF has a shared chunk listing many disciplines
        # (table of contents, summary table) — that chunk would match every
        # ad's keyword filter and bring the OTHER disciplines' content
        # into the wrong card.
        if keywords:
            strict = [c for c in chunks
                      if any(k in c["text"][:80].lower() for k in keywords)]
            if strict:
                # When the section header is found, prefer the FIRST chunk
                # in document order (the actual section opener) and that's
                # it — additional "high-scoring" chunks tend to cross
                # section boundaries.
                strict.sort(key=lambda c: c["idx"])
                first = strict[0]
                if chunk_score(first["text"]) > 0:
                    return [first]
                return []
            # Fallback: loose keyword match anywhere
            loose = [c for c in chunks
                     if any(k in c["text"].lower() for k in keywords)]
            if loose:
                scored = sorted([(chunk_score(c["text"]), c) for c in loose],
                                key=lambda x: -x[0])
                top = [c for s, c in scored if s > 0][:1]
                return sorted(top, key=lambda c: c["idx"])
        # No keyword info — score across all chunks, take top-3
        scored = sorted([(chunk_score(c["text"]), c) for c in chunks],
                        key=lambda x: -x[0])
        substantive = [c for s, c in scored if s > 0]
        if not substantive:
            return []
        return sorted(substantive[:3], key=lambda c: c["idx"])

    def chunks_to_excerpt(picked: list[dict]) -> str:
        text = "\n\n".join(c["text"].strip() for c in picked)
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 1800:
            text = text[:1800].rsplit(" ", 1)[0] + "…"
        return text

    enriched = 0
    section_hits = 0
    for pdf, refs in pdf_to_refs.items():
        chunks = pdf_to_chunks.get(pdf, [])
        if not chunks:
            continue
        sections = pdf_to_sections.get(pdf, {})
        for ref in refs:
            ad = ads_by_id.get(ref.get("ad_id"))
            if not ad:
                continue
            # Prefer section-based extraction (clean per-discipline boundary)
            sec_text = section_for_ad(ad, sections)
            if sec_text:
                # Cap and clean whitespace
                clean = re.sub(r"\s+", " ", sec_text).strip()
                if len(clean) > 1800:
                    clean = clean[:1800].rsplit(" ", 1)[0] + "…"
                ad["pdf_excerpt"] = clean
                ad["pdf_source_url"] = pdf_to_url.get(pdf, "")
                enriched += 1
                section_hits += 1
                continue
            # Fallback: keyword-filtered chunks
            kws = keywords_for_ad(ad)
            picked = pick_chunks(chunks, kws)
            if not picked:
                continue
            ad["pdf_excerpt"] = chunks_to_excerpt(picked)
            ad["pdf_source_url"] = pdf_to_url.get(pdf, "")
            enriched += 1

    print(f"enriched {enriched} ads with pdf_excerpt "
          f"({section_hits} via section parser, {enriched - section_hits} via chunk fallback) "
          f"(out of {len(ads)} total)")

    # URL-fallback: ads whose original_url IS the PDF (and that didn't
    # land via the manifest references list).
    fallback = 0
    for ad in ads:
        if ad.get("pdf_excerpt"):
            continue
        for field in ("original_url", "annexure_pdf_url", "apply_url"):
            url = ad.get(field) or ""
            n = normalise_url(url)
            if not n:
                continue                # defensive: never look up an empty URL
            pdf = url_to_pdf.get(n)
            if not pdf:
                continue
            chunks = pdf_to_chunks.get(pdf, [])
            picked = pick_chunks(chunks, keywords_for_ad(ad))
            if not picked:
                continue
            ad["pdf_excerpt"] = chunks_to_excerpt(picked)
            ad["pdf_source_url"] = pdf_to_url.get(pdf, "")
            fallback += 1
            break
    if fallback:
        print(f"  + {fallback} additional ads via direct-URL match")

    if args.dry_run:
        print("(dry-run; no file written)")
        return 0

    CURRENT_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {CURRENT_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
