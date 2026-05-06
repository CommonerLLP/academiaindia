"""APU per-position parser regression tests.

The per-position parser (`_apu_position_ad`) extracts a position's
narrative + requirements + application-procedure block from a single
APU detail page. Earlier versions concatenated all four chunks into one
em-dash-joined excerpt, which produced three card-level bugs the
maintainer flagged after seeing them on whoseuniversity.org:

  1. Duplication — APU's meta-description summary text is *also* a
     standalone <p> on the page that the narrative regex matches, so
     the same opening sentence appeared twice in the excerpt.
  2. Requirements rendered twice — once concatenated into the excerpt,
     once via the dedicated "Requirements" detail block (unit_eligibility).
  3. Application instructions polluted the description body. They
     belong on the application-target page (linked via apply_url), not
     in the position narrative.

These tests pin the corrected behaviour: excerpt = summary + narrative
(deduplicated), unit_eligibility = requirements only, application-
procedure text is not surfaced in either place.
"""

from datetime import datetime, timezone

from parsers.private_university import _apu_position_ad


SAMPLE_HTML = """\
<!doctype html>
<html>
<head>
  <meta name="description" content="We invite applications for faculty positions in History for our Undergraduate Programmes.">
</head>
<body>
  <h1></h1>
  <h1>Faculty Positions in History</h1>

  <p>We invite applications for faculty positions in History for our Undergraduate Programmes.</p>
  <p>We invite applications for full-time faculty positions in Ancient India. We are currently looking for candidates who can teach a broad range of core and elective courses.</p>

  <section>
    <h3>Requirements</h3>
    <p>Expertise and experience in the area mentioned above. Relevant advanced degree in History with teaching or research experience.</p>
  </section>

  <section>
    <h3>Application Procedure</h3>
    <p>Please email the following documents to facultypositions@apu.edu.in with the subject line: "Application for Faculty Positions in History — Bhopal".</p>
  </section>
</body>
</html>
"""

URL = "https://azimpremjiuniversity.edu.in/jobs/sample"
FETCHED_AT = datetime(2026, 5, 6, tzinfo=timezone.utc)


def test_apu_position_returns_ad():
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    assert ad is not None
    assert ad.get("title") == "Faculty Positions in History"
    assert ad.get("discipline") == "History"


def test_apu_position_excerpt_no_meta_summary_duplication():
    """The meta-description sentence must appear exactly once."""
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    excerpt = ad.get("raw_text_excerpt", "")
    summary = "We invite applications for faculty positions in History for our Undergraduate Programmes."
    assert excerpt.count(summary) == 1, (
        f"Meta-description summary appeared {excerpt.count(summary)} times in excerpt:\n{excerpt}"
    )


def test_apu_position_excerpt_excludes_requirements():
    """Requirements must NOT appear in the excerpt — they belong in unit_eligibility."""
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    excerpt = ad.get("raw_text_excerpt", "")
    # Sentinel phrase from the Requirements section
    assert "Expertise and experience in the area mentioned above" not in excerpt
    assert "advanced degree in History with teaching" not in excerpt


def test_apu_position_excerpt_excludes_application_procedure():
    """Application-procedure text must NOT appear in the excerpt."""
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    excerpt = ad.get("raw_text_excerpt", "")
    assert "facultypositions@apu.edu.in" not in excerpt
    assert "Please email the following documents" not in excerpt


def test_apu_position_unit_eligibility_carries_requirements():
    """The Requirements section must populate unit_eligibility."""
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    elig = ad.get("unit_eligibility", "")
    assert "Expertise and experience" in elig
    assert "advanced degree in History" in elig


# ---- "Open Positions: N" lift ----------------------------------------------
#
# APU embeds the post-count as the tail of a Requirements sentence:
#   "…education for public service Open positions: 2"
# The tracker's renderer already has a "{N} posts" chip and uses the
# count as a heuristic for the Article-16 tooltip. The parser must lift
# the integer into number_of_posts and strip the phrase from the prose
# so it doesn't render twice.

POSTS_HTML = """\
<!doctype html>
<html>
<head>
  <meta name="description" content="We invite applications for faculty positions in Sociology.">
</head>
<body>
  <h1></h1>
  <h1>Faculty Positions in Sociology</h1>
  <p>We invite applications for faculty positions in Sociology.</p>
  <section>
    <h3>Requirements</h3>
    <p>PhD in Sociology required. Open positions: 3.</p>
  </section>
  <section>
    <h3>Application Procedure</h3>
    <p>Email facultypositions@apu.edu.in</p>
  </section>
</body>
</html>
"""


def test_apu_position_lifts_open_positions_into_number_of_posts():
    """`Open positions: N` in the Requirements text becomes an integer
    on the structured `number_of_posts` field."""
    ad = _apu_position_ad(POSTS_HTML, URL, FETCHED_AT)
    assert ad.get("number_of_posts") == 3


def test_apu_position_strips_open_positions_from_unit_eligibility():
    """After the lift, the literal "Open positions: 3" must not still
    appear in unit_eligibility — otherwise the count renders twice
    (once as the structured chip, once as tail-end prose)."""
    ad = _apu_position_ad(POSTS_HTML, URL, FETCHED_AT)
    elig = ad.get("unit_eligibility", "")
    assert "Open positions" not in elig.lower() or "Open positions:" not in elig
    # The other Requirements content must survive.
    assert "PhD in Sociology required" in elig


def test_apu_position_no_open_positions_phrase_means_no_count():
    """If the page doesn't carry an `Open positions: N` phrase, the
    parser leaves number_of_posts as None (the default for the
    schema field, surfaced by _make_ad). Don't invent a count."""
    # SAMPLE_HTML's Requirements section has no "Open positions" sentence.
    ad = _apu_position_ad(SAMPLE_HTML, URL, FETCHED_AT)
    assert ad.get("number_of_posts") is None
