"""Inject local PDF extraction JSONs into docs/data/current.json.

The local extraction layer lives in corpus/extracted/ and is intentionally
gitignored: PDFs, parsed layouts, embeddings, and LLM extraction traces stay
on the maintainer machine. This script is the deterministic bridge that
publishes the useful, source-grounded position fields into the static
dashboard data file.

Inputs:
  - docs/data/current.json
  - .cache/job-ad-pdfs/manifest.jsonl
  - corpus/extracted/*.json

Outputs:
  - docs/data/current.json, in place, unless --dry-run is passed

The injector does not split or create new ad cards. It attaches the best
matching extracted position(s) to existing ad rows under:
  - structured_position   (best match)
  - structured_positions  (all accepted matches, usually one)
  - pdf_extraction        (provenance/match metadata)

Run:
  .venv/bin/python scripts/inject_extracted_into_current.py --dry-run
  .venv/bin/python scripts/inject_extracted_into_current.py
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from copy import deepcopy
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CURRENT_JSON = ROOT / "docs" / "data" / "current.json"
MANIFEST = ROOT / ".cache" / "job-ad-pdfs" / "manifest.jsonl"
EXTRACTED_DIR = ROOT / "corpus" / "extracted"

CATS = ("UR", "SC", "ST", "OBC", "EWS", "PwBD")
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "by", "for", "from", "in", "is",
    "of", "on", "or", "the", "to", "with", "faculty", "department",
    "centre", "center", "school", "professor", "assistant", "associate",
}
GENERIC_AREA_RE = re.compile(
    r"^\s*(?:see\s+annexure|same(?:\s+as\s+\w+)?|department[-\s]+specific|"
    r"detailed\s+per[-\s]+department)\b",
    re.I,
)


def norm(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s or "").lower()).strip()


def tokens(s: Any) -> set[str]:
    return {t for t in norm(s).split() if len(t) > 1 and t not in STOPWORDS}


def clean_text(s: Any) -> str | None:
    text = re.sub(r"\s+", " ", str(s or "")).strip()
    return text or None


def validate_date(s: Any) -> str | None:
    if not s:
        return None
    try:
        date.fromisoformat(str(s))
        return str(s)
    except ValueError:
        return None


def validate_breakdown(value: Any) -> dict[str, int | None]:
    src = value if isinstance(value, dict) else {}
    out: dict[str, int | None] = {}
    for cat in CATS:
        v = src.get(cat)
        if v is None:
            out[cat] = None
        elif isinstance(v, int) and v >= 0:
            out[cat] = v
        else:
            out[cat] = None
    return out


def clean_areas(areas: Any) -> list[str]:
    if not isinstance(areas, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for area in areas:
        a = clean_text(area)
        if not a or GENERIC_AREA_RE.search(a):
            continue
        key = norm(a)
        if key and key not in seen:
            seen.add(key)
            out.append(a)
    return out


def normalize_position(pos: dict[str, Any], source: dict[str, Any], pdf_filename: str) -> dict[str, Any]:
    q = pos.get("qualifications") if isinstance(pos.get("qualifications"), dict) else {}
    out = {
        "department": clean_text(pos.get("department")),
        "discipline": clean_text(pos.get("discipline")),
        "school_or_centre": clean_text(pos.get("school_or_centre")),
        "ranks": [clean_text(x) for x in pos.get("ranks", []) if clean_text(x)] if isinstance(pos.get("ranks"), list) else [],
        "contract_status": clean_text(pos.get("contract_status")),
        "post_type": clean_text(pos.get("post_type")),
        "areas": clean_areas(pos.get("areas")),
        "methods_preference": clean_text(pos.get("methods_preference")),
        "approach": clean_text(pos.get("approach")),
        "qualifications": {
            "phd": clean_text(q.get("phd")),
            "first_class_preceding_degree": clean_text(q.get("first_class_preceding_degree")),
            "post_phd_experience_years": q.get("post_phd_experience_years") if isinstance(q.get("post_phd_experience_years"), int) else None,
            "publications_required": clean_text(q.get("publications_required")),
            "teaching_experience": clean_text(q.get("teaching_experience")),
            "other": clean_text(q.get("other")),
        },
        "general_eligibility": clean_text(pos.get("general_eligibility")),
        "specific_eligibility": clean_text(pos.get("specific_eligibility")),
        "reservation_breakdown": validate_breakdown(pos.get("reservation_breakdown")),
        "is_special_recruitment_drive": bool(pos.get("is_special_recruitment_drive")),
        "is_composite_call": bool(pos.get("is_composite_call")),
        "number_of_posts": pos.get("number_of_posts") if isinstance(pos.get("number_of_posts"), int) and pos.get("number_of_posts") >= 0 else None,
        "pay_scale": clean_text(pos.get("pay_scale")),
        "application_deadline": validate_date(pos.get("application_deadline")),
        "open_date": validate_date(pos.get("open_date")),
        "raw_section_text": clean_text(pos.get("raw_section_text")),
        "apply_url": clean_text(pos.get("apply_url")),
        "extraction_confidence": float(pos.get("extraction_confidence", 0.0) or 0.0),
        "source_pdf": pdf_filename,
        "source_pdf_url": clean_text(source.get("pdf_url")),
        "extraction_method": clean_text(source.get("extraction_method")),
        "structure_family": clean_text(source.get("structure_family")),
    }
    return out


def validate_extracted_payload(path: Path) -> tuple[dict[str, Any] | None, str | None]:
    try:
        data = json.loads(path.read_text())
    except Exception as e:
        return None, f"invalid JSON: {e}"
    if not isinstance(data.get("positions"), list):
        return None, "positions is missing/not a list"
    for i, pos in enumerate(data["positions"]):
        if not isinstance(pos, dict):
            return None, f"position {i} is not an object"
        if pos and not (pos.get("department") or pos.get("discipline")):
            return None, f"position {i} lacks department/discipline"
        conf = pos.get("extraction_confidence")
        if pos and not isinstance(conf, (int, float)):
            return None, f"position {i} lacks numeric extraction_confidence"
        for cat, val in validate_breakdown(pos.get("reservation_breakdown")).items():
            if val is not None and val < 0:
                return None, f"position {i} has invalid {cat}"
        for field in ("application_deadline", "open_date"):
            if pos.get(field) and not validate_date(pos.get(field)):
                return None, f"position {i} has invalid {field}"
    return data, None


def manifest_by_filename() -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for line in MANIFEST.read_text().splitlines():
        if not line.strip():
            continue
        entry = json.loads(line)
        if entry.get("filename"):
            out[entry["filename"]] = entry
    return out


def position_score(ad: dict[str, Any], pos: dict[str, Any]) -> int:
    ad_title = ad.get("title") or ""
    ad_dept = ad.get("department") or ""
    ad_disc = ad.get("discipline") or ""
    ad_text = " ".join(str(ad.get(k) or "") for k in (
        "title", "department", "discipline", "pdf_excerpt", "raw_text_excerpt"
    ))
    pos_unit = " ".join(str(pos.get(k) or "") for k in (
        "department", "discipline", "school_or_centre"
    ))
    pos_text = " ".join([
        pos_unit,
        pos.get("raw_section_text") or "",
        " ".join(pos.get("areas") or []),
        pos.get("methods_preference") or "",
        pos.get("approach") or "",
    ])
    score = 0
    n_ad_dept, n_ad_disc, n_title = norm(ad_dept), norm(ad_disc), norm(ad_title)
    n_pos_dept, n_pos_disc = norm(pos.get("department")), norm(pos.get("discipline"))
    if n_ad_dept and n_pos_dept:
        if n_ad_dept == n_pos_dept or n_ad_dept in n_pos_dept or n_pos_dept in n_ad_dept:
            score += 12
        elif tokens(n_ad_dept) & tokens(n_pos_dept):
            score += min(6, len(tokens(n_ad_dept) & tokens(n_pos_dept)) * 2)
    if n_ad_disc and n_pos_disc:
        if n_ad_disc == n_pos_disc:
            score += 14
        elif n_ad_disc in n_pos_disc or n_pos_disc in n_ad_disc:
            score += 10
        elif tokens(n_ad_disc) & tokens(n_pos_disc):
            score += min(8, len(tokens(n_ad_disc) & tokens(n_pos_disc)) * 3)
    if n_pos_disc and n_pos_disc in n_title:
        score += 10
    if n_pos_dept and n_pos_dept in n_title:
        score += 8
    overlap = tokens(ad_text) & tokens(pos_text)
    score += min(12, len(overlap))
    if pos.get("raw_section_text") and len(pos["raw_section_text"]) > 120:
        score += 2
    if pos.get("areas"):
        score += 2
    return score


def choose_matches(refs: list[dict[str, Any]], positions: list[dict[str, Any]], ads_by_id: dict[str, dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    matches: dict[str, list[dict[str, Any]]] = {}
    if not refs or not positions:
        return matches

    # Single-ad PDFs can legitimately contain several positions (open-rank
    # or area-grid PDFs). Attach all positions to that one card.
    if len(refs) == 1:
        ad_id = refs[0].get("ad_id")
        if ad_id in ads_by_id:
            matches[ad_id] = positions
        return matches

    # Multi-ad PDFs: choose the best position per referenced ad. A threshold
    # prevents metadata-only annexures from mass-attaching to every card.
    for ref in refs:
        ad_id = ref.get("ad_id")
        ad = ads_by_id.get(ad_id)
        if not ad:
            continue
        ranked = sorted(((position_score(ad, p), p) for p in positions), key=lambda x: x[0], reverse=True)
        if not ranked:
            continue
        best_score, best = ranked[0]
        second_score = ranked[1][0] if len(ranked) > 1 else -1
        if best_score >= 10 and (best_score - second_score >= 2 or best_score >= 18):
            matches[ad_id] = [best]
    return matches


def merge_position(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """Prefer the richer of duplicate matches for the same ad/PDF."""
    def richness(p: dict[str, Any]) -> int:
        return (
            len(p.get("areas") or []) * 3
            + (len(p.get("raw_section_text") or "") // 80)
            + int(bool(p.get("methods_preference"))) * 3
            + int(bool((p.get("qualifications") or {}).get("publications_required"))) * 3
            + int((p.get("extraction_confidence") or 0) * 4)
        )
    return incoming if richness(incoming) > richness(existing) else existing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", default="corpus/injection_report.json")
    args = parser.parse_args()

    if not CURRENT_JSON.exists() or not MANIFEST.exists() or not EXTRACTED_DIR.exists():
        print("ERROR: required current.json, manifest, or corpus/extracted is missing", file=sys.stderr)
        return 1

    data = json.loads(CURRENT_JSON.read_text())
    ads = data.get("ads", [])
    ads_by_id = {ad["id"]: ad for ad in ads if ad.get("id")}
    manifest = manifest_by_filename()

    # Clear previous injection output so reruns are deterministic.
    for ad in ads:
        for key in ("structured_position", "structured_positions", "pdf_extraction"):
            ad.pop(key, None)

    report = {
        "files_seen": 0,
        "files_injected": 0,
        "files_skipped": [],
        "ads_touched": 0,
        "positions_attached": 0,
        "admin_files": 0,
        "matched": [],
    }

    pending: dict[str, list[dict[str, Any]]] = {}
    for path in sorted(EXTRACTED_DIR.glob("*.json")):
        report["files_seen"] += 1
        extracted, err = validate_extracted_payload(path)
        if err or extracted is None:
            report["files_skipped"].append({"file": path.name, "reason": err})
            continue
        positions_raw = extracted.get("positions", [])
        if not positions_raw:
            report["admin_files"] += 1
            continue
        pdf_filename = extracted.get("pdf_filename") or (path.stem + ".pdf")
        manifest_entry = manifest.get(pdf_filename)
        if not manifest_entry:
            report["files_skipped"].append({"file": path.name, "reason": f"no manifest entry for {pdf_filename}"})
            continue
        source_meta = {
            "pdf_url": extracted.get("pdf_url") or manifest_entry.get("url"),
            "extraction_method": extracted.get("extraction_method"),
            "structure_family": extracted.get("structure_family"),
        }
        positions = [normalize_position(p, source_meta, pdf_filename) for p in positions_raw]
        matched = choose_matches(manifest_entry.get("references", []), positions, ads_by_id)
        if not matched:
            report["files_skipped"].append({"file": path.name, "reason": "no ad-position match passed threshold"})
            continue
        report["files_injected"] += 1
        for ad_id, pos_list in matched.items():
            pending.setdefault(ad_id, [])
            for pos in pos_list:
                # De-dupe by source PDF + department + discipline.
                key = (pos.get("source_pdf"), norm(pos.get("department")), norm(pos.get("discipline")))
                found = None
                for i, old in enumerate(pending[ad_id]):
                    old_key = (old.get("source_pdf"), norm(old.get("department")), norm(old.get("discipline")))
                    if old_key == key:
                        found = i
                        break
                if found is None:
                    pending[ad_id].append(pos)
                else:
                    pending[ad_id][found] = merge_position(pending[ad_id][found], pos)
            report["matched"].append({"file": path.name, "ad_id": ad_id, "positions": len(pos_list)})

    for ad_id, positions in pending.items():
        positions = sorted(
            positions,
            key=lambda p: (
                -int((p.get("extraction_confidence") or 0) * 100),
                -len(p.get("areas") or []),
                -(len(p.get("raw_section_text") or "")),
            ),
        )
        ad = ads_by_id[ad_id]
        ad["structured_positions"] = positions
        ad["structured_position"] = positions[0]
        ad["pdf_extraction"] = {
            "status": "matched",
            "positions": len(positions),
            "source_pdfs": sorted({p["source_pdf"] for p in positions if p.get("source_pdf")}),
            "methods": sorted({p["extraction_method"] for p in positions if p.get("extraction_method")}),
        }
        report["positions_attached"] += len(positions)
    report["ads_touched"] = len(pending)

    print(
        f"validated {report['files_seen']} extracted files; "
        f"injected {report['files_injected']} files into {report['ads_touched']} ads; "
        f"attached {report['positions_attached']} positions; "
        f"admin/empty {report['admin_files']}; skipped {len(report['files_skipped'])}"
    )

    report_path = ROOT / args.report
    report_path.parent.mkdir(parents=True, exist_ok=True)
    if not args.dry_run:
        CURRENT_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(f"wrote {CURRENT_JSON.relative_to(ROOT)}")
        print(f"wrote {report_path.relative_to(ROOT)}")
    else:
        print("(dry-run; no files written)")
        for skip in report["files_skipped"][:10]:
            print(f"skip: {skip['file']} — {skip['reason']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
