"""Light tests for orchestrator helpers in `run.py`.

We don't run the full `run()` function (it does network I/O); instead we
test the pure helpers plus a small monkeypatched `run()` path that decides
what goes into current.json regardless of the actual fetch outcome.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import run


def test_ensure_unique_ad_id_passes_through_unique():
    used = set()
    ad = {"id": "abc123", "institution_id": "iit-x", "title": "A"}
    run.ensure_unique_ad_id(ad, used)
    assert ad["id"] == "abc123"
    assert "abc123" in used


def test_ensure_unique_ad_id_resolves_collision():
    """If the same id has already been used in this run, the helper should
    derive a new stable id deterministically rather than overwriting an
    existing record."""
    used = {"abc123"}
    ad = {"id": "abc123", "institution_id": "iit-x",
          "original_url": "https://x/y.pdf", "title": "A"}
    run.ensure_unique_ad_id(ad, used)
    assert ad["id"] != "abc123"
    assert ad["id"] in used
    # And it's stable across calls with the same inputs:
    used2 = {"abc123"}
    ad2 = {"id": "abc123", "institution_id": "iit-x",
           "original_url": "https://x/y.pdf", "title": "A"}
    run.ensure_unique_ad_id(ad2, used2)
    assert ad["id"] == ad2["id"]


def test_normalize_ad_substitutes_placeholder_institution_id():
    """Parsers emit `__placeholder__` for institution_id; the orchestrator
    swaps in the real registry id."""
    used = set()
    inst = {"id": "iit-bombay"}
    ad = {"id": "abc", "institution_id": "__placeholder__",
          "title": "T", "original_url": "https://x"}
    out = run.normalize_ad(ad, inst, "official scrape", used)
    assert out["institution_id"] == "iit-bombay"
    assert out["_source_method"] == "official scrape"


def test_carry_forward_skips_rolling_stubs():
    """Stale-archive carry-forward should not duplicate rolling-stub
    placeholders — those get re-emitted fresh by `rolling_stub()`."""
    used = set()
    previous = {"iim-x": [
        {"id": "1", "institution_id": "iim-x", "_rolling_stub": True, "title": "stub"},
        {"id": "2", "institution_id": "iim-x", "title": "real ad"},
    ]}
    inst = {"id": "iim-x"}
    carried = run.carry_forward_ads(inst, previous, used, "test reason")
    assert len(carried) == 1
    assert carried[0]["title"] == "real ad"
    assert carried[0]["_source_method"] == "stale carry-forward"


def test_rolling_stub_has_required_fields():
    inst = {"id": "iim-a", "career_page_url_guess": "https://iima.ac.in/x"}
    stub = run.rolling_stub(inst, datetime.now(timezone.utc), "")
    # Required JobAd fields:
    for k in ("id", "institution_id", "title", "original_url", "snapshot_fetched_at"):
        assert stub.get(k) is not None, f"missing {k}"
    assert stub["_rolling_stub"] is True


def test_partial_run_replaces_only_target_institution(monkeypatch, tmp_path: Path):
    registry = [
        {"id": "anna-university", "career_page_url_guess": "https://anna.example/jobs", "parser": "anna_university"},
        {"id": "iit-delhi", "career_page_url_guess": "https://iitd.example/jobs", "parser": "generic"},
    ]
    registry_path = tmp_path / "registry.json"
    registry_path.write_text(json.dumps(registry))

    out_dir = tmp_path / "out"
    out_dir.mkdir()
    (out_dir / "archive").mkdir()
    (out_dir / "current.json").write_text(json.dumps({
        "generated_at": "2026-05-06T00:00:00+00:00",
        "ad_count": 2,
        "ads": [
            {"id": "old-anna", "institution_id": "anna-university", "title": "old anna", "original_url": "https://anna.example/old"},
            {"id": "old-iitd", "institution_id": "iit-delhi", "title": "old iitd", "original_url": "https://iitd.example/old"},
        ],
    }))
    (out_dir / "coverage_report.json").write_text(json.dumps({
        "generated_at": "2026-05-06T00:00:00+00:00",
        "institutions_attempted": 2,
        "institutions_succeeded": 2,
        "institutions_with_ads": 2,
        "ads_found_total": 2,
        "rows": [
            {"institution_id": "anna-university", "parser": "anna_university", "fetch_status": "ok", "http_status": 200, "ads_found": 1, "note": "old"},
            {"institution_id": "iit-delhi", "parser": "generic", "fetch_status": "ok", "http_status": 200, "ads_found": 1, "note": "old"},
        ],
    }))

    class FakeResult:
        status = "ok"
        http_status = 200
        url = "https://anna.example/jobs"
        final_url = "https://anna.example/jobs"
        text = "<html></html>"
        fetched_at = datetime(2026, 5, 7, tzinfo=timezone.utc)

    def fake_fetch(*args, **kwargs):
        return FakeResult()

    def fake_parse(_html, _url, fetched_at):
        return [{
            "id": "new-anna",
            "institution_id": "__placeholder__",
            "title": "new anna",
            "original_url": "https://anna.example/new",
            "snapshot_fetched_at": fetched_at.isoformat(),
            "parse_confidence": 0.9,
        }]

    monkeypatch.setattr(run, "fetch", fake_fetch)
    monkeypatch.setattr(run, "dispatch_parser", lambda _name: fake_parse)

    stats = run.run(registry_path, out_dir, tmp_path / "cache", institution_ids=["anna-university"])

    current = json.loads((out_dir / "current.json").read_text())
    assert [ad["id"] for ad in current["ads"]] == ["new-anna", "old-iitd"]
    assert stats["attempted"] == 1
    assert stats["with_ads"] == 1

    coverage = json.loads((out_dir / "coverage_report.json").read_text())
    rows = {row["institution_id"]: row for row in coverage["rows"]}
    assert rows["anna-university"]["ads_found"] == 1
    assert rows["anna-university"]["note"] == ""
    assert rows["iit-delhi"]["note"] == "old"
