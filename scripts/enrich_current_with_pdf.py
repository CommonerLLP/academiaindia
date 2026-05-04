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

    def pick_chunks(chunks: list[dict], keywords: list[str]) -> list[dict]:
        if not chunks:
            return []
        # First try: chunks that mention any keyword
        relevant = chunks
        if keywords:
            relevant = [c for c in chunks if any(k in c["text"].lower() for k in keywords)]
            if not relevant:
                relevant = chunks  # keyword filter found nothing
        scored = sorted([(chunk_score(c["text"]), c) for c in relevant], key=lambda x: -x[0])
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
    for pdf, refs in pdf_to_refs.items():
        chunks = pdf_to_chunks.get(pdf, [])
        if not chunks:
            continue
        for ref in refs:
            ad = ads_by_id.get(ref.get("ad_id"))
            if not ad:
                continue
            kws = keywords_for_ad(ad)
            picked = pick_chunks(chunks, kws)
            if not picked:
                continue
            ad["pdf_excerpt"] = chunks_to_excerpt(picked)
            ad["pdf_source_url"] = pdf_to_url.get(pdf, "")
            enriched += 1

    print(f"enriched {enriched} ads with pdf_excerpt (out of {len(ads)} total)")

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
