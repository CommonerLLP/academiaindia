from datetime import datetime, timezone
from pathlib import Path

from parsers.anna_university import parse


FIXTURE_PATH = Path(__file__).with_name("fixtures") / "anna_university_recruitment.html"


def _fixture() -> str:
    return FIXTURE_PATH.read_text()


def test_parse_extracts_faculty_and_research_listings() -> None:
    items = parse(
        _fixture(),
        "https://www.annauniv.edu/recruitment.php",
        datetime(2026, 5, 6, tzinfo=timezone.utc),
    )

    assert len(items) == 3
    titles = {item["title"] for item in items}
    assert "Recruitment Junior Research fellow (JRF)" in titles
    assert "Recruitment for Project Assistant in the ANRF funded project" in titles
    assert "Notification for Assistant Professor in Architecture" in titles
    assert all(item["original_url"].startswith("https://www.annauniv.edu/") for item in items)
    assert all(item["publication_date"] in {"2026-04-08", "2026-04-06", "2026-03-20"} for item in items)
    by_title = {item["title"]: item for item in items}
    assert by_title["Recruitment Junior Research fellow (JRF)"]["department"] == "CME"
    assert by_title["Recruitment for Project Assistant in the ANRF funded project"]["department"] == "CCM"
    assert by_title["Notification for Assistant Professor in Architecture"]["department"] == "Department of Architecture"


def test_parse_skips_non_academic_admin_listings() -> None:
    items = parse(
        _fixture(),
        "https://www.annauniv.edu/recruitment.php",
        datetime(2026, 5, 6, tzinfo=timezone.utc),
    )

    assert all("Registrar" not in item["title"] for item in items)
    assert all("Administrative Assistant" not in item["title"] for item in items)


def test_parse_handles_empty_or_garbage_input() -> None:
    fetched_at = datetime(2026, 5, 6, tzinfo=timezone.utc)

    assert parse("", "https://www.annauniv.edu/recruitment.php", fetched_at) == []
    assert isinstance(parse("<html><body></body></html>", "https://www.annauniv.edu/recruitment.php", fetched_at), list)
