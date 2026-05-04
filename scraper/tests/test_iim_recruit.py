"""Tests for the IIM-style PDF discovery regex (`RECRUIT_RE` / `SKIP_RE`).

The IIM parser walks every PDF link on a careers page; these regexes decide
which links are actual faculty-recruitment ads versus noise (recruiters'
guides, prospectuses, HR policy manuals). Truth-table tests catch the kind
of regression where a single character change breaks a whole category.
"""

import pytest

from parsers.iim_recruit import RECRUIT_RE, SKIP_RE


@pytest.mark.parametrize("text,should_match", [
    # Real recruitment-ad anchor texts seen in the wild:
    ("Tenure Track Faculty Positions (SSH)", True),
    ("Faculty Position (ECE)", True),
    ('Call For "Professor of Practice" Positions at IIM Calcutta', True),
    ("Tenure-track faculty positions in ECE", True),
    ("Faculty Recruitment in Strategy Area", True),
    ("Faculty Search 2026", True),
    ("Faculty job opening", True),
    ("Recruitment in Marketing area", True),
    ("Associate Professor", True),
    # Non-matches: navigation, brochures, student-facing materials:
    ("Detailed Advertisement", False),
    ("Application Form", False),
    ("Recruiters Guide", False),
    ("Placements Calendar", False),
    ("HR Policy Manual", False),
    ("Some random link", False),
    ("Faculty profiles", False),  # listing, not recruitment
])
def test_recruit_re(text, should_match):
    assert bool(RECRUIT_RE.search(text)) is should_match, (
        f"RECRUIT_RE on {text!r} should be {should_match}"
    )


@pytest.mark.parametrize("text,should_skip", [
    # Things SKIP_RE must catch even when RECRUIT_RE also matches:
    ("Recruiters Guide 2024", True),
    ("Faculty placement brochure", True),
    ("PGP Prospectus", True),
    ("HR Policy Manual 2026", True),
    ("Non-Teaching Staff Recruitment Notice", True),
    ("Technical Staff Vacancies", True),
    ("Administrative Staff Hiring", True),
    # Things SKIP_RE must NOT catch:
    ("Faculty Positions", False),
    ("Professor of Practice", False),
])
def test_skip_re(text, should_skip):
    assert bool(SKIP_RE.search(text)) is should_skip, (
        f"SKIP_RE on {text!r} should be {should_skip}"
    )


def test_skip_takes_priority_over_recruit():
    """A "Recruiters Guide" matches RECRUIT_RE incidentally (via "recruit"),
    but SKIP_RE should fire first in the parser. Smoke-check both regexes
    against the same string."""
    s = "Recruiters Guide 2024 — for student placements"
    # RECRUIT_RE may or may not match (current regex doesn't via "recruit"
    # alone; this is a future-proofing assertion). SKIP_RE definitely should.
    assert SKIP_RE.search(s) is not None
