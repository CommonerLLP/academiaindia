#!/usr/bin/env python3
"""Validate docs/data/current.json before publishing scraper output.

The daily/weekly sweep writes third-party data that the static frontend
renders directly. This script is the CI shape gate: it fails fast when the
JSON is malformed, unexpectedly empty, sharply smaller than the prior
committed copy, or contains obviously unsafe strings/URLs.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


DEFAULT_CURRENT = Path("docs/data/current.json")
URL_FIELDS = {"apply_url", "original_url", "info_url", "annexure_pdf_url"}
SAFE_SCHEMES = {"http", "https", "mailto", "file"}
UNSAFE_TEXT_RE = re.compile(r"<\s*script\b|javascript\s*:|data\s*:\s*text/html", re.I)


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise ValueError(f"{path} does not exist") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} is not valid JSON: {exc}") from exc


def load_json_from_git(ref: str, path: Path) -> Any | None:
    proc = subprocess.run(
        ["git", "show", f"{ref}:{path.as_posix()}"],
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def ad_count(doc: Any) -> int:
    if not isinstance(doc, dict):
        return 0
    if isinstance(doc.get("ad_count"), int):
        return doc["ad_count"]
    ads = doc.get("ads")
    return len(ads) if isinstance(ads, list) else 0


def is_safe_url(value: str) -> bool:
    s = value.strip()
    if not s:
        return True
    if s.startswith(("#", "/", "./", "../")):
        return True
    parsed = urlparse(s)
    if not parsed.scheme:
        return True
    return parsed.scheme.lower() in SAFE_SCHEMES


def walk_strings(value: Any, path: str = "$"):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, list):
        for i, item in enumerate(value):
            yield from walk_strings(item, f"{path}[{i}]")
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from walk_strings(item, f"{path}.{key}")


def validate(doc: Any, previous: Any | None, max_drop: float) -> list[str]:
    errors: list[str] = []

    if not isinstance(doc, dict):
        return ["top-level JSON value must be an object"]

    ads = doc.get("ads")
    if not isinstance(ads, list):
        errors.append("top-level 'ads' must be an array")
        ads = []
    elif not ads:
        errors.append("top-level 'ads' array must be non-empty")

    current_count = len(ads)
    declared_count = doc.get("ad_count")
    if declared_count is not None and declared_count != current_count:
        errors.append(f"ad_count is {declared_count}, but ads contains {current_count} records")

    if previous is not None:
        previous_count = ad_count(previous)
        if previous_count > 0 and current_count < previous_count * (1 - max_drop):
            errors.append(
                f"ad count dropped from {previous_count} to {current_count} "
                f"(>{max_drop:.0%} threshold)"
            )

    for i, ad in enumerate(ads):
        if not isinstance(ad, dict):
            errors.append(f"ads[{i}] must be an object")
            continue

        if not str(ad.get("id") or "").strip():
            errors.append(f"ads[{i}].id must be non-empty")
        if not str(ad.get("institution_id") or "").strip():
            errors.append(f"ads[{i}].institution_id must be non-empty")

        for field in URL_FIELDS:
            value = ad.get(field)
            if value is None or value == "":
                continue
            if not isinstance(value, str):
                errors.append(f"ads[{i}].{field} must be a string or null")
            elif not is_safe_url(value):
                errors.append(f"ads[{i}].{field} has unsafe URL scheme: {value!r}")

    for path, value in walk_strings(doc):
        if UNSAFE_TEXT_RE.search(value):
            errors.append(f"{path} contains unsafe script-like content")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--current", type=Path, default=DEFAULT_CURRENT)
    parser.add_argument("--compare-ref", default="HEAD")
    parser.add_argument("--max-drop", type=float, default=0.20)
    parser.add_argument("--no-compare", action="store_true")
    args = parser.parse_args()

    try:
        current = load_json(args.current)
    except ValueError as exc:
        print(f"validate_current: {exc}", file=sys.stderr)
        return 1

    previous = None if args.no_compare else load_json_from_git(args.compare_ref, args.current)
    errors = validate(current, previous, args.max_drop)

    if errors:
        print("validate_current: FAILED", file=sys.stderr)
        for error in errors[:50]:
            print(f"- {error}", file=sys.stderr)
        if len(errors) > 50:
            print(f"- ... {len(errors) - 50} more errors", file=sys.stderr)
        return 1

    compare = "without previous-count comparison" if previous is None else f"against {args.compare_ref}"
    print(f"validate_current: OK ({ad_count(current)} ads, {compare})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
