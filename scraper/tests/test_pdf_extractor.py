"""Tests for `pdf_extractor` — the splitter and deadline regex are the
two pieces most likely to silently regress when adjusted.
"""

import pytest

from pdf_extractor import (
    _is_safe_url,
    _strip_pagination_noise,
    find_deadline,
    find_publications,
    split_into_units,
)


# ---- _strip_pagination_noise -------------------------------------------------
#
# pdftotext interleaves the source PDF's "Page N of M" footer between
# sentences when a paragraph crosses a page boundary. The IITD rolling-ad
# PDF reproduced this on the Technology-in-Society listing — the body
# text ended up reading "…strong background in Science and Page 14 of 28
# Technology Studies or allied disciplines…", which then surfaced on the
# job card. These tests pin the corrected behaviour: the pagination
# patterns are stripped to a single space at extraction time, so words
# that were split across the footer rejoin with normal word-spacing.

@pytest.mark.parametrize("dirty,clean", [
    # Inline mid-sentence: the IITD case the maintainer flagged. The
    # horizontal whitespace around the pagination marker collapses, so
    # split words rejoin with a single space.
    (
        "candidates with a strong background in Science and Page 14 of 28 Technology Studies or allied disciplines",
        "candidates with a strong background in Science and Technology Studies or allied disciplines",
    ),
    # Standalone "Page N of M" line — newlines on either side MUST be
    # preserved (otherwise the rolling-ad splitter loses the next
    # unit-header at line-start, which was the Chemistry-bleeds-into-
    # Civil regression). The marker becomes a single-space line so the
    # newline boundaries stay intact for the line-anchored splitter
    # regex on the next line.
    (
        "corresponding author.\n\n           Page 8 of 28\n5   Department of Civil",
        "corresponding author.\n\n \n5   Department of Civil",
    ),
    # Two-line case: the marker is between two paragraphs.
    ("Body line 1\nPage 7 of 12\nBody line 2", "Body line 1\n \nBody line 2"),
    # Standalone "Page N" line on its own (the MULTILINE pattern).
    ("Body\n  Page 3  \nMore body", "Body\n \nMore body"),
    # Hyphen-flanked centered footer: " - 5 - " between blocks.
    ("Block A\n - 5 - \nBlock B", "Block A\n \nBlock B"),
    # Lowercase variant — case-insensitive match.
    ("Words page 2 of 9 more words", "Words more words"),
    # Empty input — must not blow up.
    ("", ""),
    # No pagination noise — leave content alone.
    ("Plain body with no footer.", "Plain body with no footer."),
    # Form-feed (\f) at start of a unit-header line. pdftotext inserts
    # \f at every page boundary; the splitter's indent class is [ \t]*
    # which does NOT match \f, so a unit whose row starts the page
    # becomes invisible. Strip replaces \f with a single space, which
    # the splitter's [ \t]* indent class does match — so "5" sits at
    # line-start once again.
    ("Body line.\n\f5   Department of Civil", "Body line.\n 5   Department of Civil"),
])
def test_strip_pagination_noise(dirty, clean):
    """Pagination footers are removed; surrounding content is preserved."""
    assert _strip_pagination_noise(dirty) == clean


def test_strip_pagination_noise_preserves_layout_runs():
    """Long runs of spaces (used by the rolling-ad column splitter) must
    survive — the strip function only removes the pagination patterns,
    not the layout-tabular spacing IIT/IIM parsers depend on."""
    # A row from the IITD layout-extracted output.
    row = "  1  Aerospace Engineering          Aerodynamics; Propulsion        Sr. AP"
    assert _strip_pagination_noise(row) == row


# ---- split_into_units --------------------------------------------------------
#
# Snapshot fixtures: condensed reproductions of the column layout each IIT
# uses. We don't ship the real PDFs in tests because they're institute IP and
# binary. These fixtures are hand-extracted from `pdftotext -layout` output
# and cover the structural patterns we care about.

# IIT Bombay: 3 sequential units, then a non-sequential block (centre 17)
# preceded by units 3–16. The monotonic filter requires sequential numbering
# from a low start, which matches real PDFs (units 1..N with no gaps).
IITB_FIXTURE = """\
Sr.   Academic Unit            Areas of Specialization

1     Aerospace Engineering    Application of AI/ML and numerical techniques
                               to aerospace and related multi-physics systems.

2     Biosciences &            (1) Medical Instrumentation
      Bioengineering           (2) Medical Signal Processing

3     Chemical Engineering     Various subareas of chemical engineering.

4     Chemistry                Areas in chemistry.
"""

# IIT Delhi: a TOC line followed by per-unit annexure rows. The TOC line
# packs units 1 and 12 onto the same line; the splitter must skip it so the
# real annexure rows below get picked up. Units must start sequentially from
# a low number (real IITD PDFs are 1..21 with no gaps in the annexure).
IITD_FIXTURE = """\
S. No.   Department                          S. No.   Department
   1     Department of Applied Mechanics       12     Department of Material Science

1   Department of Applied Mechanics    Areas in applied mechanics.

2   Department of Chemical             Areas in chemical engineering.
    Engineering

3   Department of Civil &              Areas in civil and environmental engineering.
    Environmental Engineering
"""


def test_split_into_units_iitb_basic():
    """IIT Bombay PDFs: 3-column rows; unit name is the second column,
    Areas is the third. The splitter should pick out unit names cleanly."""
    blocks = split_into_units(IITB_FIXTURE)
    nums = [b.unit_num for b in blocks]
    assert nums == [1, 2, 3, 4], f"expected 1..4, got {nums}"
    assert "Aerospace Engineering" in blocks[0].unit_name
    assert "Biosciences" in blocks[1].unit_name
    # Continuation lines should attach: "Biosciences &\n  Bioengineering" → glued.
    assert "Bioengineering" in blocks[1].unit_name


def test_split_into_units_iitd_skips_toc_and_glues_wrapped_names():
    """IIT Delhi style: a TOC line bundles two unit headers; the splitter
    must skip it (TOC_DOUBLE catches it), then glue wrapped names like
    'Department of Chemical\\n  Engineering' back into one."""
    blocks = split_into_units(IITD_FIXTURE)
    nums = sorted(b.unit_num for b in blocks)
    assert nums == [1, 2, 3], f"TOC may have leaked; got {nums}"
    chem = next(b for b in blocks if b.unit_num == 2)
    assert "Chemical" in chem.unit_name
    assert "Engineering" in chem.unit_name, (
        f"continuation line not glued; name={chem.unit_name!r}"
    )


def test_split_into_units_empty_text():
    assert split_into_units("") == []
    assert split_into_units("just some prose with no unit headers") == []


# ---- find_deadline -----------------------------------------------------------

DEADLINE_PHRASINGS = [
    # The wrapped IITD style: "submitted on\n  or before June 30, 2026"
    ("The completed application along with supporting documents should be submitted on\n         or before June 30, 2026, 23:59 PM (IST)", "June 30, 2026"),
    # IIT-B page-metadata style (after HTML strip)
    ("Application Last Date Thu, 31/12/2026 - 23:59", "31/12/2026"),
    # Generic "deadline is" phrasing
    ("The deadline is January 15, 2027.", "January 15, 2027"),
    # Last date for / of
    ("Last date for application: April 30, 2026", "April 30, 2026"),
    # Past-cycle date — should be REJECTED (year < floor).
    ("on or before March 1, 2019.", None),
]


@pytest.mark.parametrize("text,expected", DEADLINE_PHRASINGS)
def test_find_deadline(text, expected):
    got = find_deadline(text)
    if expected is None:
        assert got is None, f"expected past date to be rejected, got {got!r}"
    else:
        assert got == expected, f"text={text!r}, got={got!r}, expected={expected!r}"


# ---- find_publications -------------------------------------------------------

def test_find_publications_minimum_of():
    text = "Candidates should have a minimum of FIVE (5) original refereed publications in indexed journals."
    out = find_publications(text)
    assert out is not None
    assert "FIVE" in out or "5" in out


def test_find_publications_at_least():
    text = "At least 3 publications in reputed peer-reviewed journals."
    out = find_publications(text)
    assert out is not None
    assert "3" in out


def test_find_publications_none():
    assert find_publications("Just a short paragraph about the institute.") is None


# ---- SSRF guard --------------------------------------------------------------

@pytest.mark.parametrize("url,safe", [
    ("https://example.com/file.pdf", True),
    ("http://example.org/x.pdf", True),
    # Non-http(s) refused:
    ("file:///etc/passwd", False),
    ("ftp://x.com/y.pdf", False),
    # Loopback / private IPs refused:
    ("http://127.0.0.1/x.pdf", False),
    ("http://localhost/x.pdf", False),
    ("http://10.0.0.5/x.pdf", False),
    ("http://192.168.1.1/x.pdf", False),
    # Malformed:
    ("", False),
    ("not a url", False),
])
def test_is_safe_url(url, safe):
    """SSRF guard: refuses non-http(s) schemes and private/loopback IPs."""
    # We don't strictly need DNS for the loopback test — getaddrinfo should
    # resolve `localhost` to 127.0.0.1 on any reasonable system. If a CI box
    # has weird DNS, mark as xfail there; locally this should pass.
    assert _is_safe_url(url) is safe
