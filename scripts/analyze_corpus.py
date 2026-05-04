"""Analyse the consolidated parliamentary corpus to produce four
chart-ready data files for the Vacancies dashboard:

  corpus/chart0_volume.json       — year × house question counts
  corpus/chart5_disclosure.json   — year × disclosure-quality breakdown
  corpus/chartx_boilerplate.json  — year × rhetorical-phrase frequency
  corpus/charty_topics.json       — topic clusters via k-means on embeddings

Per-question raw analysis is also written to:
  corpus/per_question_analysis.jsonl

How disclosure quality is detected (per answer text):
  - "category"    = SC AND (ST OR OBC) appear within 200 chars of an explicit count
                   or the text contains a recognisable category roster (e.g. "SC-15", "SC: 15")
  - "institution" = an institution-specific count appears (specific institute name + count)
  - "aggregate"   = a total faculty / vacancy count appears in the answer (e.g. "5,182 vacant")

How boilerplate is detected:
  - mission_mode  = /mission\s+mode/i
  - autonomy      = /no\s+active\s+role\s+of\s+the\s+Ministry/i  (the verbatim phrase)
  - flexi_cadre   = /flexi[\s-]?cadre/i
  - no_suitable   = /no\s+suitable\s+candidate/i  (the discretionary brake)

How topics are clustered:
  - Take the existing 5,888-chunk embedding file
  - Aggregate to question-level by averaging chunk vectors per PDF
  - k-means into 8 clusters
  - Hand-label clusters in a follow-up pass
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "corpus" / "parliamentary_corpus.jsonl"
PDF_DIR = ROOT / "corpus" / "pdfs_combined"
INDEX_DIR = ROOT / "corpus" / "parliamentary_index"
OUT_DIR = ROOT / "corpus"

# Regex detectors
CAT_TERMS = re.compile(r"\b(SC|ST|OBC|EWS|PwBD|PwD)\b", re.I)
CAT_WITH_NUMBER = re.compile(
    r"\b(SC|ST|OBC|EWS|PwBD|PwD)[\s\-:]+\d+%?", re.I
)
SC_AND_ST = re.compile(r"\bSC\b.{0,200}\bST\b", re.I | re.DOTALL)

# Aggregate vacancy markers — number followed by "vacant" or "vacancies",
# or "X out of Y posts", or numeric tables.
AGGREGATE = re.compile(
    r"\b\d{2,5}\s+(?:vacant|vacancies?|posts?\s+(?:are\s+)?lying\s+vacant)|"
    r"sanctioned\s+(?:strength|posts)\s+(?:is|are)\s+\d{2,6}|"
    r"\bvacant\s+(?:teaching\s+)?posts?\s+(?:in\s+\w+\s+)*(?:are|is)\s+\d{2,5}",
    re.I
)

INSTITUTION_NAMES = re.compile(
    r"\b(IIT\s+\w+|IIM\s+\w+|NIT\s+\w+|IISER\s+\w+|AIIMS\s+\w+|"
    r"University\s+of\s+\w+|Central\s+University\s+of\s+\w+)\b",
    re.I
)

# Boilerplate detectors
BOILERPLATE = {
    "mission_mode":  re.compile(r"\bmission\s+mode\b", re.I),
    "autonomy":      re.compile(r"no\s+active\s+role\s+of\s+the\s+Ministry", re.I),
    "flexi_cadre":   re.compile(r"flexi[\s\-]?cadre", re.I),
    "no_suitable":   re.compile(r"no\s+suitable\s+candidate", re.I),
    "rozgar_mela":   re.compile(r"rozgar\s+mela", re.I),
    "cei_rtc_act":   re.compile(r"CEI\s*\(?\s*RTC\s*\)?\s*Act|Central\s+Educational\s+Institutions.{0,40}Reservation\s+in\s+Teachers", re.I),
}


def extract_text(path: Path) -> str:
    """Use pdftotext (preserves layout); fall back to pdfminer."""
    try:
        out = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            capture_output=True, text=True, timeout=30, check=False,
        )
        if out.returncode == 0:
            return out.stdout
    except Exception:
        pass
    try:
        from pdfminer.high_level import extract_text as pm_extract
        return pm_extract(str(path))
    except Exception:
        return ""


def classify_disclosure(text: str) -> dict:
    """Classify what an answer contained."""
    has_aggregate = bool(AGGREGATE.search(text))
    has_category_with_numbers = len(CAT_WITH_NUMBER.findall(text)) >= 3
    # Loose category mention: SC and ST appear together within proximity
    has_category_mention = bool(SC_AND_ST.search(text))
    has_category = has_category_with_numbers and has_category_mention
    has_institution = len(INSTITUTION_NAMES.findall(text)) >= 2 and has_aggregate
    return {
        "has_aggregate":   has_aggregate,
        "has_category":    has_category,
        "has_institution": has_institution,
    }


def detect_boilerplate(text: str) -> dict[str, int]:
    return {key: len(rx.findall(text)) for key, rx in BOILERPLATE.items()}


def find_pdf(rec: dict) -> Path | None:
    """Locate the PDF for a manifest record using its pdf_path or fallback."""
    if rec.get("pdf_path"):
        p = ROOT / rec["pdf_path"]
        if p.exists():
            return p
        # The combined symlink directory has a flat namespace; pdf_path may
        # point into _sansad_crawl/. Try the combined dir's symlink too.
        candidate = PDF_DIR / Path(rec["pdf_path"]).name
        if candidate.exists():
            return candidate
    return None


# ---------- main analysis pass ----------

def run_per_question() -> list[dict]:
    records = []
    with MANIFEST.open() as f:
        for line in f:
            try: records.append(json.loads(line))
            except json.JSONDecodeError: continue

    print(f"Total questions: {len(records)}")
    out: list[dict] = []
    for i, rec in enumerate(records, 1):
        if i % 50 == 0:
            print(f"  analysed {i}/{len(records)}", file=sys.stderr)
        pdf = find_pdf(rec)
        text = ""
        if pdf:
            text = extract_text(pdf)
        d = classify_disclosure(text) if text else {"has_aggregate": False, "has_category": False, "has_institution": False}
        b = detect_boilerplate(text) if text else {k: 0 for k in BOILERPLATE}
        rec_out = {
            "key":       rec.get("key"),
            "house":     rec.get("house"),
            "qtype":     (rec.get("qtype") or "").upper().strip(),
            "qno":       rec.get("qno"),
            "date":      rec.get("date"),
            "year":      (rec.get("date") or "0000")[:4],
            "title":     rec.get("title"),
            "ministry":  rec.get("ministry"),
            "pdf_name":  pdf.name if pdf else None,
            "text_len":  len(text),
            **{f"discl_{k}": v for k, v in d.items()},
            **{f"boilerplate_{k}": v for k, v in b.items()},
        }
        out.append(rec_out)

    (OUT_DIR / "per_question_analysis.jsonl").write_text(
        "\n".join(json.dumps(r, ensure_ascii=False) for r in out) + "\n"
    )
    return out


# ---------- aggregate to chart data ----------

def chart0_volume(per_q: list[dict]) -> dict:
    """Year × house question counts."""
    counts = defaultdict(lambda: defaultdict(int))
    for r in per_q:
        y = r["year"]
        h = r["house"] or "Unknown"
        if y >= "2020":
            counts[y][h] += 1
    years = sorted(counts.keys())
    return {
        "years": years,
        "Lok Sabha":  [counts[y].get("Lok Sabha", 0) for y in years],
        "Rajya Sabha":[counts[y].get("Rajya Sabha", 0) for y in years],
    }


def chart5_disclosure(per_q: list[dict]) -> dict:
    """Year × disclosure-quality percentages."""
    by_year = defaultdict(list)
    for r in per_q:
        if r["year"] >= "2020":
            by_year[r["year"]].append(r)
    out = {"years": [], "category_pct": [], "institution_pct": [], "aggregate_pct": [], "n_per_year": []}
    for y in sorted(by_year.keys()):
        recs = by_year[y]
        n = len(recs)
        if n == 0: continue
        out["years"].append(y)
        out["n_per_year"].append(n)
        out["category_pct"].append(round(100 * sum(r["discl_has_category"] for r in recs) / n, 1))
        out["institution_pct"].append(round(100 * sum(r["discl_has_institution"] for r in recs) / n, 1))
        out["aggregate_pct"].append(round(100 * sum(r["discl_has_aggregate"] for r in recs) / n, 1))
    return out


def chartx_boilerplate(per_q: list[dict]) -> dict:
    """Year × boilerplate-phrase frequency (number of answers containing each)."""
    by_year = defaultdict(list)
    for r in per_q:
        if r["year"] >= "2020":
            by_year[r["year"]].append(r)
    keys = ["mission_mode", "autonomy", "flexi_cadre", "no_suitable", "rozgar_mela", "cei_rtc_act"]
    out = {"years": [], "n_per_year": []}
    for k in keys: out[k + "_pct"] = []
    for y in sorted(by_year.keys()):
        recs = by_year[y]
        n = len(recs)
        if n == 0: continue
        out["years"].append(y)
        out["n_per_year"].append(n)
        for k in keys:
            count_with = sum(1 for r in recs if r.get(f"boilerplate_{k}", 0) > 0)
            out[k + "_pct"].append(round(100 * count_with / n, 1))
    return out


def charty_topics(per_q: list[dict]) -> dict:
    """K-means cluster question-level mean-embeddings into 8 topics."""
    chunks_path = INDEX_DIR / "chunks.jsonl"
    embeddings_path = INDEX_DIR / "embeddings.npy"
    if not chunks_path.exists() or not embeddings_path.exists():
        print("[warn] embeddings not found; skipping topic clusters", file=sys.stderr)
        return {"clusters": [], "available": False}
    chunks = []
    with chunks_path.open() as f:
        for line in f:
            try: chunks.append(json.loads(line))
            except: pass
    vecs = np.load(embeddings_path)
    print(f"  topic clustering: {len(chunks)} chunks, {vecs.shape[0]} vecs", file=sys.stderr)
    # Aggregate to per-PDF mean
    by_pdf: dict[str, list[int]] = defaultdict(list)
    for i, c in enumerate(chunks):
        by_pdf[c["pdf"]].append(i)
    pdf_names = sorted(by_pdf.keys())
    pdf_mean = np.array([vecs[by_pdf[p]].mean(axis=0) for p in pdf_names])
    # Normalize for cosine k-means
    pdf_mean = pdf_mean / (np.linalg.norm(pdf_mean, axis=1, keepdims=True) + 1e-9)
    # Simple k-means (no sklearn required) — k=8, 50 iters
    K = 8
    rng = np.random.default_rng(7)
    init = rng.choice(len(pdf_mean), size=K, replace=False)
    centers = pdf_mean[init].copy()
    for _ in range(50):
        sims = pdf_mean @ centers.T
        labels = sims.argmax(axis=1)
        new_centers = np.array([
            (pdf_mean[labels == k].mean(axis=0) if (labels == k).any() else centers[k])
            for k in range(K)
        ])
        new_centers = new_centers / (np.linalg.norm(new_centers, axis=1, keepdims=True) + 1e-9)
        if np.allclose(new_centers, centers, atol=1e-4):
            break
        centers = new_centers
    sims = pdf_mean @ centers.T
    labels = sims.argmax(axis=1)
    # Build cluster summaries
    pdf_to_q = {(r.get("pdf_name") or ""): r for r in per_q if r.get("pdf_name")}
    clusters = []
    for k in range(K):
        members = [pdf_names[i] for i in range(len(pdf_names)) if labels[i] == k]
        # Top representative titles (closest to center)
        member_idxs = [i for i in range(len(pdf_names)) if labels[i] == k]
        if not member_idxs:
            continue
        member_sims = sims[member_idxs, k]
        top_order = np.argsort(-member_sims)[:8]
        top_titles = []
        for j in top_order:
            pdf = pdf_names[member_idxs[j]]
            q = pdf_to_q.get(pdf)
            if q and q.get("title"):
                top_titles.append(q["title"][:90])
        clusters.append({
            "id": int(k),
            "size": len(members),
            "top_titles": top_titles,
        })
    clusters.sort(key=lambda c: -c["size"])
    return {"clusters": clusters, "available": True}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("=== analysing per question ===")
    per_q = run_per_question()
    print()
    print("=== chart 0: volume ===")
    c0 = chart0_volume(per_q)
    print(json.dumps(c0, indent=2))
    (OUT_DIR / "chart0_volume.json").write_text(json.dumps(c0, indent=2))
    print()
    print("=== chart 5: disclosure quality ===")
    c5 = chart5_disclosure(per_q)
    print(json.dumps(c5, indent=2))
    (OUT_DIR / "chart5_disclosure.json").write_text(json.dumps(c5, indent=2))
    print()
    print("=== chart x: boilerplate frequency ===")
    cx = chartx_boilerplate(per_q)
    print(json.dumps(cx, indent=2))
    (OUT_DIR / "chartx_boilerplate.json").write_text(json.dumps(cx, indent=2))
    print()
    print("=== chart y: topic clusters ===")
    cy = charty_topics(per_q)
    (OUT_DIR / "charty_topics.json").write_text(json.dumps(cy, indent=2))
    for c in cy.get("clusters", []):
        print(f"  cluster {c['id']} (n={c['size']}):")
        for t in c["top_titles"][:3]:
            print(f"    {t}")
    print()
    print("DONE — wrote chart0/5/x/y JSON files to corpus/")


if __name__ == "__main__":
    main()
