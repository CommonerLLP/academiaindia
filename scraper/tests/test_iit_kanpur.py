"""Tests for the IIT-Kanpur department-block extractor.

The big regression risk here is the 2-pass strategy (KNOWN_DEPTS first, then
the generic fallback): we want the known names to win and the generic pass
to catch only what the known list missed.
"""

from parsers.iit_kanpur import _extract_dept_blocks


PAGE_FRAGMENT = """\
Department-Wise Area of Specialization

Aerospace Engineering: The department seeks applications from candidates
with specialization in aerodynamics, flight mechanics, propulsion.

Humanities and Social Sciences: We invite applications in Sociology,
Anthropology, Linguistics.

Centre for Quantum Information and Quantum Communication: A new centre
established in 2025; recruiting in any area of quantum information theory.

Note: Candidates must apply via the online portal.
"""


def test_known_dept_match():
    """Aerospace + HSS should be picked up by the known-name pass."""
    blocks = _extract_dept_blocks(PAGE_FRAGMENT)
    names = [name for name, _body in blocks]
    assert "Aerospace Engineering" in names
    assert "Humanities and Social Sciences" in names


def test_generic_pass_picks_up_new_centres():
    """A centre not in KNOWN_DEPTS should still surface via the generic
    ProperNoun-phrase fallback. This is the regression we explicitly want
    to prevent."""
    blocks = _extract_dept_blocks(PAGE_FRAGMENT)
    names = [name for name, _body in blocks]
    assert any("Quantum Information" in n for n in names), (
        f"generic pass missed the new centre; names={names}"
    )


def test_skip_phrase_not_treated_as_dept():
    """Page boilerplate like 'Note:' or 'Page Of Contents:' should NOT be
    treated as department headers."""
    blocks = _extract_dept_blocks(PAGE_FRAGMENT)
    names = [name for name, _body in blocks]
    assert "Note" not in names
    assert not any(n.lower().startswith("note") for n in names)


def test_extracts_body_for_each_dept():
    """The body slice for each department should contain its description."""
    blocks = _extract_dept_blocks(PAGE_FRAGMENT)
    for name, body in blocks:
        if name == "Aerospace Engineering":
            assert "aerodynamics" in body.lower()
        elif name == "Humanities and Social Sciences":
            assert "sociology" in body.lower()
