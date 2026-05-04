"""Light tests for orchestrator helpers in `run.py`.

We don't run the full `run()` function (it does network I/O); instead we
test the pure helpers — `ensure_unique_ad_id`, `normalize_ad`,
`carry_forward_ads` — that decide what goes into current.json regardless
of the actual fetch outcome.
"""

from datetime import datetime, timezone

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
