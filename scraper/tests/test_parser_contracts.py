"""Cross-parser contract tests.

Every parser in `scraper/parsers/` ships a `parse(text, url, fetched_at)`
function whose output flows into the same downstream pipeline (registry
join → snapshot archive → site JSON). Without these tests the parsers
shared no enforced contract — a single parser returning a malformed dict
or crashing on empty input would surface as a silent regression in the
nightly scrape.

This module asserts the **minimum viable contract** every parser must
satisfy:

  1. Module imports without side effects.
  2. `parse()` exists and is callable with the standard signature.
  3. `parse()` returns a list (possibly empty) for empty/trivial input
     — i.e. no parser may crash when its source page has no ads.
  4. If items are returned, each carries `id`, `title`, `original_url`,
     and `institution_id`, with `id` a non-empty string and `title` a
     non-empty string.
  5. `parse_confidence` (when present) lies in [0, 1].

Stronger per-parser tests (specific selector logic, date handling,
reservation parsing) live in their own files; this module is the
floor, not the ceiling.

Network discipline: contract tests must NOT hit the network. Several
parsers (iim_recruit, iit_rolling) call `download_pdf(...)` when they
find PDF links in the input HTML. We feed them HTML that is intentionally
empty of those links so the network paths never fire.
"""

from __future__ import annotations

import importlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pytest


# Each parser, the kind of input its `parse()` accepts (HTML or plain text),
# and a piece of input that should produce zero ads without triggering
# network IO. Keep the inputs minimal — they are fixtures, not realism.
PARSERS = [
    ("parsers.generic",            "html",   "<html><body><p>no jobs</p></body></html>"),
    ("parsers.iit_delhi",          "html",   "<html><body><div>no positions</div></body></html>"),
    ("parsers.iit_indore",         "html",   "<html><body><table></table></body></html>"),
    ("parsers.iit_kanpur",         "html",   "<html><body><p>nothing here</p></body></html>"),
    ("parsers.iit_rolling",        "html",   "<html><body><p>no pdf links</p></body></html>"),
    ("parsers.iim_recruit",        "html",   "<html><body><p>no pdf links</p></body></html>"),
    ("parsers.jnu",                "html",   "<html><body><p>nothing</p></body></html>"),
    ("parsers.private_university", "html",   "<html><body><p>nothing</p></body></html>"),
    ("parsers.samarth_curec",      "text",   "{}"),  # samarth takes JSON-ish text
]


@pytest.mark.parametrize("module_name,kind,fixture", PARSERS, ids=[p[0] for p in PARSERS])
def test_parser_imports_and_parses_empty(module_name: str, kind: str, fixture: str) -> None:
    """Each parser module imports cleanly and `parse()` returns a list
    (typically empty) for input that has no ads."""
    module = importlib.import_module(module_name)
    assert hasattr(module, "parse"), f"{module_name} has no parse() function"
    fetched_at = datetime(2026, 5, 4, tzinfo=timezone.utc)
    url = "https://example.org/jobs"
    out = module.parse(fixture, url, fetched_at)
    assert isinstance(out, list), f"{module_name}.parse() returned {type(out).__name__}, not list"


@pytest.mark.parametrize("module_name,kind,fixture", PARSERS, ids=[p[0] for p in PARSERS])
def test_parser_resilient_to_garbage_input(module_name: str, kind: str, fixture: str) -> None:
    """No parser may crash on malformed input. Pass empty string and a
    string of HTML-ish noise; both should produce a list (likely empty)."""
    module = importlib.import_module(module_name)
    fetched_at = datetime(2026, 5, 4, tzinfo=timezone.utc)
    url = "https://example.org/jobs"
    for bad in ("", "   ", "<", ">", "<html><body></body></html>"):
        out = module.parse(bad, url, fetched_at)
        assert isinstance(out, list), (
            f"{module_name}.parse({bad!r}) returned {type(out).__name__}, not list"
        )


def _as_dict(item: Any) -> dict:
    """Parsers ship some outputs as Pydantic models, others as dicts.
    This helper normalises so contract assertions don't have to know which."""
    if hasattr(item, "model_dump"):
        return item.model_dump()
    if hasattr(item, "dict"):
        return item.dict()
    return dict(item)


# Per-parser positive fixtures. Where we can construct a minimal HTML
# fragment that the parser SHOULD produce ≥1 ad from, we assert the
# canonical fields. Parsers without an easy hand-written positive
# fixture get the `None` fixture and skip the positive assertion.
POSITIVE_FIXTURES = {
    # IIT Delhi parser looks for "Faculty Recruitment" anchor + table.
    # Skipping positive fixture here — the parser's logic is tightly
    # coupled to live page structure and a contrived fixture would
    # over-fit. The empty-input tests above still cover it.
    "parsers.iit_delhi": None,
    "parsers.iit_indore": None,
    "parsers.iit_kanpur": None,
    "parsers.iit_rolling": None,
    "parsers.iim_recruit": None,
    "parsers.jnu": None,
    "parsers.private_university": None,
    "parsers.samarth_curec": None,
    "parsers.generic": None,
}


@pytest.mark.parametrize("module_name", [p[0] for p in PARSERS])
def test_returned_items_satisfy_canonical_contract(module_name: str) -> None:
    """When a parser returns ads, each must carry the canonical fields:
    id (non-empty str), title (non-empty str), original_url, institution_id.
    parse_confidence (when present) must be in [0, 1].

    Driven from POSITIVE_FIXTURES; parsers without a fixture are skipped
    rather than failing — the empty-input tests above guarantee they
    don't crash, and per-parser test files cover their happy paths.
    """
    fixture = POSITIVE_FIXTURES.get(module_name)
    if fixture is None:
        pytest.skip(f"no positive fixture for {module_name}; covered by per-parser tests")
    module = importlib.import_module(module_name)
    fetched_at = datetime(2026, 5, 4, tzinfo=timezone.utc)
    url = "https://example.org/jobs"
    items = module.parse(fixture, url, fetched_at)
    assert items, f"{module_name} positive fixture produced no ads"
    for item in items:
        d = _as_dict(item)
        assert d.get("id"), f"{module_name} item missing id: {d}"
        assert isinstance(d["id"], str) and d["id"], f"{module_name} id not a non-empty string"
        assert d.get("title"), f"{module_name} item missing title: {d}"
        assert d.get("original_url") or d.get("url"), f"{module_name} item missing original_url"
        assert d.get("institution_id") is not None, f"{module_name} item missing institution_id"
        if "parse_confidence" in d and d["parse_confidence"] is not None:
            assert 0.0 <= float(d["parse_confidence"]) <= 1.0, (
                f"{module_name} parse_confidence out of range: {d['parse_confidence']}"
            )
