"""Regression tests for `iit_rolling._short_excerpt`.

The excerpt-builder reads a UnitBlock and produces the description-text
that surfaces on the job card. An earlier version dropped line 0 of the
block outright (`text.splitlines()[1:]`), which lost any Areas-or-
Criteria content that sat on the unit-header row in IITD's 4-column
PDF layout. The rendered IITD Chemistry card therefore opened mid-
clause with "reputed journals…" instead of including the Area
("Biochemistry") and the start of the Criteria sentence.

These tests pin the corrected cell-based stripping: drop the S.No
cell + unit-name cell from each line, keep the rest.
"""

import pytest

from pdf_extractor import UnitBlock
from parsers.iit_rolling import _short_excerpt


def test_iitd_chemistry_short_unit_preserves_area_and_criteria():
    """The IITD Chemistry row carries Areas + Criteria on the unit-header
    line. Dropping that line entirely loses both. The fix preserves them."""
    # Reproduces the exact shape pdftotext produces for IITD's row 4.
    text = (
        "4   Department Of   Biochemistry                               A minimum of ten peer-reviewed original research articles in\n"
        "    Chemistry                                                  reputed journals, with at least five of them as first author or\n"
        "                                                               corresponding author."
    )
    unit = UnitBlock(unit_num=4, unit_name="Department Of Chemistry", text=text)
    excerpt = _short_excerpt(unit)
    # Area is preserved
    assert "Biochemistry" in excerpt
    # Full criteria sentence is preserved (was previously starting mid-clause)
    assert "A minimum of ten peer-reviewed original research articles" in excerpt
    assert "corresponding author." in excerpt
    # Unit-name continuation is stripped (no stray "Chemistry" inside content)
    assert "Chemistry reputed" not in excerpt


def test_short_excerpt_drops_unit_name_when_alone_on_line_zero():
    """The previous-style block where line 0 has only the header (S.No +
    Unit name) and content begins on line 1. The strip must NOT regress
    this case — line 0 still ends up empty, line 1 onwards is content."""
    text = (
        "10   Department of Humanities & Social Sciences\n"
        "     Economics: Specialization in Quantitative Macroeconomics."
    )
    unit = UnitBlock(unit_num=10, unit_name="Department of Humanities & Social Sciences", text=text)
    excerpt = _short_excerpt(unit)
    assert excerpt.startswith("Economics:")
    assert "Department" not in excerpt
    assert "Humanities" not in excerpt


def test_short_excerpt_preserves_content_words_that_overlap_unit_name():
    """A content word that happens to match a unit-name word must NOT
    be stripped if it appears mid-content. The dropping logic stops at
    the first non-unit-name cell on a line."""
    text = (
        "13   Department of Mathematics  Harmonic Analysis,  Publication record: 4 papers in Mathematics journals."
    )
    unit = UnitBlock(unit_num=13, unit_name="Department of Mathematics", text=text)
    excerpt = _short_excerpt(unit)
    # "Mathematics" appears once as the unit name (stripped) and once
    # in the content cell ("Mathematics journals") which must survive.
    assert "Harmonic Analysis" in excerpt
    assert "Mathematics journals" in excerpt
    assert "4 papers" in excerpt


def test_short_excerpt_collapses_whitespace():
    """Multiple-space gutters from the layout get collapsed to single spaces."""
    text = (
        "1   Department Of Foo            Area X            Criterion Y\n"
        "                                 Area X-2          Criterion Y-2"
    )
    unit = UnitBlock(unit_num=1, unit_name="Department Of Foo", text=text)
    excerpt = _short_excerpt(unit)
    # No runs of multiple spaces in the output
    assert "  " not in excerpt
    assert "Area X" in excerpt
    assert "Criterion Y" in excerpt
    assert "Area X-2" in excerpt
    assert "Criterion Y-2" in excerpt


# ---- _extract_columns: per-line column-boundary detection ------------------
#
# pdftotext's column alignment shifts row-by-row; a fixed character-position
# anchor taken from the header line truncates content mid-word for units
# whose continuation lines drift by 1+ chars. _extract_columns classifies
# each whitespace gap on each line as either the col-2/col-3 boundary or
# the col-3/col-4 boundary, then slices using the gap's edges. These
# tests pin the corrected behaviour against fixtures hand-extracted from
# IITD's Apr 2026 rolling-ad PDF.

from parsers.iit_rolling import _extract_columns


def test_extract_columns_clean_letter_list_and_bullets():
    """Applied Mechanics shape: Areas as letter-prefixed list, Criteria
    as bullets. Header line carries the first item of each column."""
    text = (
        "   1   Department Of          a.   Design and Optimization                Publication Record:\n"
        "       Applied Mechanics      b.   Experimental Mechanics                    •   Minimum 4 SCI/SCIE listed reputed journal papers\n"
        "                              c.   High-Speed Flows                              with at least 3 as first author.\n"
    )
    unit = UnitBlock(unit_num=1, unit_name="Department Of Applied Mechanics", text=text)
    areas, criteria = _extract_columns(unit)
    assert "a.   Design and Optimization" in areas
    assert "b.   Experimental Mechanics" in areas
    assert "c.   High-Speed Flows" in areas
    assert "Applied Mechanics" not in areas, "Unit-name continuation must be stripped"
    assert "Publication Record:" in criteria
    assert "Minimum 4 SCI/SCIE" in criteria
    assert "at least 3 as first author" in criteria


def test_extract_columns_handles_per_line_position_drift():
    """IITD Civil Engineering reproduces a continuation-line shift where
    the col-3 anchor on the header is at pos 27 but the actual content
    on continuation lines starts at pos 26. A fixed-anchor slice cuts
    off the leading character ("Management" → "anagement"). The per-
    line gap detection picks up the actual boundary on each line."""
    text = (
        " 5   Department of Civil   Construction Engineering and                 Publications:\n"
        "    Engineering           Management: All specializations related      * For Grade-I: At least 6 refereed conference\n"
        "                          to construction engineering and              which at least 4 should be in reputed journals.\n"
    )
    unit = UnitBlock(unit_num=5, unit_name="Department of Civil Engineering", text=text)
    areas, criteria = _extract_columns(unit)
    # Full words preserved — no leading character chopping.
    assert "Management: All specializations" in areas
    assert "anagement" not in areas.replace("Management", "")
    assert "construction engineering" in areas
    assert "For Grade-I: At least 6" in criteria
    # "which at least 4" — the leading "w" must survive (the bug
    # produced "hich at least 4" by slicing one char too far right).
    assert "which at least 4" in criteria


def test_extract_columns_falls_back_when_columns_collapsed():
    """When pdftotext puts adjacent columns with <2 spaces between them,
    they merge into a single header cell and the column anchors become
    unreliable. The sanity-check rejects extraction in that case (Areas
    starting with a known criteria-section keyword) so the row-major
    fallback in _short_excerpt can take over without regression."""
    text = (
        " 8   Department Of Electrical Communication Engineering:                   Academic Background:\n"
        "    Engineering              Experimental Research in Communications      •Basic (Bachelor's) degree\n"
    )
    unit = UnitBlock(unit_num=8, unit_name="Department Of Electrical Engineering", text=text)
    areas, criteria = _extract_columns(unit)
    # Either the extraction fails (preferred — caller falls back) or
    # at least Areas does not begin with the criteria-section header.
    if areas:
        assert not areas.lower().lstrip().startswith("academic background")


def test_extract_columns_returns_empty_for_too_few_cells():
    """Header line with only S.No + Unit name (no Areas/Criteria cells)
    must return ("","") so the caller falls back."""
    text = "  3   Department of Foo\n     Bar specialisation areas..."
    unit = UnitBlock(unit_num=3, unit_name="Department of Foo", text=text)
    areas, criteria = _extract_columns(unit)
    assert areas == ""
    assert criteria == ""
