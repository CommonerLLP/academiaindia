"""Validate generated tracker data before publishing.

The alpha bar is not perfect extraction; it is that omissions, stale data, and
manual/public-interest choices are visible rather than accidental.
"""

from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path
from typing import Any


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def parse_date(value: Any, field: str, ad_id: str, errors: list[str]) -> None:
    if value in (None, ""):
        return
    try:
        if field.endswith("_at"):
            datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        else:
            date.fromisoformat(str(value))
    except ValueError:
        errors.append(f"{ad_id}: invalid {field}={value!r}")


def main() -> int:
    base = Path(__file__).resolve().parents[1]
    registry = load_json(base / "data" / "institutions_registry.json")
    current = load_json(base / "data" / "current.json")
    coverage_path = base / "data" / "coverage_report.json"
    coverage = load_json(coverage_path) if coverage_path.exists() else {"rows": []}

    inst_ids = {i["id"] for i in registry}
    errors: list[str] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()

    for inst in registry:
        if inst.get("robots_override") and not inst.get("robots_override_reason"):
            errors.append(f"{inst['id']}: robots_override requires robots_override_reason")
        if inst.get("fallback_pdf_url") and inst.get("robots_override") and "official" not in inst.get("robots_override_reason", "").lower():
            warnings.append(f"{inst['id']}: robots override reason should name the official public source")

    for ad in current.get("ads", []):
        ad_id = str(ad.get("id") or "")
        label = ad_id or f"<missing-id:{ad.get('institution_id')}:{ad.get('title')}>"
        if not ad_id:
            errors.append(f"{label}: missing id")
        elif ad_id in seen_ids:
            errors.append(f"{ad_id}: duplicate ad id")
        seen_ids.add(ad_id)

        if not ad.get("institution_id") or ad.get("institution_id") not in inst_ids:
            errors.append(f"{label}: unknown institution_id={ad.get('institution_id')!r}")
        if not ad.get("title"):
            errors.append(f"{label}: missing title")
        if not ad.get("original_url"):
            errors.append(f"{label}: missing original_url")
        if ad.get("_rolling_stub") and ad.get("closing_date"):
            errors.append(f"{label}: rolling stub must not invent a closing_date")
        if ad.get("_source_method") == "public-interest override" and not ad.get("_source_note"):
            errors.append(f"{label}: public-interest override ad requires _source_note")

        parse_date(ad.get("publication_date"), "publication_date", label, errors)
        parse_date(ad.get("closing_date"), "closing_date", label, errors)
        parse_date(ad.get("snapshot_fetched_at"), "snapshot_fetched_at", label, errors)

    row_ids = {r.get("institution_id") for r in coverage.get("rows", [])}
    missing_rows = sorted(inst_ids - row_ids)
    if missing_rows:
        warnings.append(f"coverage missing {len(missing_rows)} registry institutions")

    if warnings:
        print("Warnings:")
        for w in warnings:
            print(f"  - {w}")
    if errors:
        print("Errors:")
        for e in errors:
            print(f"  - {e}")
        return 1

    print(f"Validated {len(current.get('ads', []))} ads across {len(inst_ids)} institutions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
