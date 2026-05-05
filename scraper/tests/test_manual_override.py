"""Tests for the manual-override loader.

The point of this module is to *prove* that the regression that lost
the Ashoka Sociology & Anthropology Visiting Faculty record on
2026-05-04 cannot happen again. Two complementary guarantees:

  1. Records placed in `manual_overrides.json` are always loaded by
     `load_manual_overrides()` — across the empty/missing/malformed
     edge cases the loader is forgiving about, but valid records are
     never dropped silently.
  2. Records placed in the real `docs/data/manual_overrides.json` end
     up in the real `docs/data/current.json` after a sweep — the
     end-to-end guarantee. The latter test does NOT run a full sweep
     (slow, network-heavy); it asserts the static file pair instead.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from parsers.manual_override import load_manual_overrides


def test_missing_file_returns_empty_list(tmp_path: Path) -> None:
    out = load_manual_overrides(tmp_path / "does_not_exist.json")
    assert out == []


def test_malformed_json_returns_empty_list(tmp_path: Path) -> None:
    p = tmp_path / "manual_overrides.json"
    p.write_text("{ not valid json")
    out = load_manual_overrides(p)
    assert out == []


def test_non_array_returns_empty_list(tmp_path: Path) -> None:
    p = tmp_path / "manual_overrides.json"
    p.write_text('{"id": "x"}')  # dict, not list
    out = load_manual_overrides(p)
    assert out == []


def test_records_missing_required_fields_filtered(tmp_path: Path) -> None:
    p = tmp_path / "manual_overrides.json"
    p.write_text(json.dumps([
        {"id": "ok", "institution_id": "x", "title": "T"},
        {"id": "no-title", "institution_id": "x"},  # missing title
        {"institution_id": "x", "title": "no-id"},  # missing id
        {"id": "no-inst", "title": "T"},  # missing institution_id
        "not a dict",
    ]))
    out = load_manual_overrides(p)
    assert len(out) == 1
    assert out[0]["id"] == "ok"


def test_valid_records_preserved_with_all_fields(tmp_path: Path) -> None:
    p = tmp_path / "manual_overrides.json"
    record = {
        "id": "abc123",
        "institution_id": "ashoka-university",
        "title": "Visiting Faculty",
        "_manual_stub": True,
        "_source_method": "manual transcription from circulated card",
        "parse_confidence": 0.4,
    }
    p.write_text(json.dumps([record]))
    out = load_manual_overrides(p)
    assert len(out) == 1
    assert out[0] == record


def test_real_manual_overrides_file_is_well_formed() -> None:
    """The actual `docs/data/manual_overrides.json` must always parse.

    A malformed file silently forfeits all manual entries — this test
    catches the case where someone hand-edits the JSON and breaks it.
    """
    repo_root = Path(__file__).resolve().parents[2]
    manual_path = repo_root / "docs" / "data" / "manual_overrides.json"
    assert manual_path.exists(), "docs/data/manual_overrides.json should exist"
    out = load_manual_overrides(manual_path)
    assert isinstance(out, list)
    for rec in out:
        assert rec.get("id"), "manual override is missing id"
        assert rec.get("institution_id"), "manual override is missing institution_id"
        assert rec.get("title"), "manual override is missing title"


def test_ashoka_visiting_record_present_in_manual_overrides() -> None:
    """The specific record dropped by the 2026-05-04 sweep must always
    be in `manual_overrides.json`. This is a regression-anchor test —
    if someone deletes the entry, this fails loudly."""
    repo_root = Path(__file__).resolve().parents[2]
    manual_path = repo_root / "docs" / "data" / "manual_overrides.json"
    out = load_manual_overrides(manual_path)
    ashoka_visiting = [
        r for r in out
        if r["institution_id"] == "ashoka-university"
        and "Visiting" in r["title"]
    ]
    assert len(ashoka_visiting) >= 1, (
        "Ashoka Sociology & Anthropology Visiting Faculty record must be "
        "present in docs/data/manual_overrides.json (lost on 2026-05-04 sweep, "
        "restored via the manual-override mechanism)"
    )


def test_ashoka_visiting_record_present_in_current_json() -> None:
    """End-to-end: the manual-override record must appear in current.json.

    This guards the orchestrator's merge step — if someone removes the
    merge call from `run.py`, the next sweep would drop the Ashoka
    record again, and this test catches it before merge.
    """
    repo_root = Path(__file__).resolve().parents[2]
    current_path = repo_root / "docs" / "data" / "current.json"
    with current_path.open(encoding="utf-8") as f:
        current = json.load(f)
    ashoka_visiting = [
        a for a in current["ads"]
        if a.get("institution_id") == "ashoka-university"
        and "Visiting" in (a.get("title") or "")
    ]
    assert len(ashoka_visiting) >= 1, (
        "Ashoka Sociology & Anthropology Visiting Faculty record must be in "
        "docs/data/current.json. If this test fails, the daily sweep dropped "
        "the manual-override entry — investigate the merge step in run.py."
    )
