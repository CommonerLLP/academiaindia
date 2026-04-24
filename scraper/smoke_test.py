"""End-to-end smoke test using synthetic HTML fixtures.

Why this file
- Live scraping across 176 institutions takes ~30 minutes even with aggressive
  caching; it also depends on network conditions outside the sandbox.
- We need to prove the pipeline (fetch → parse → aggregate → render) works
  before anyone points it at real URLs.
- This test bypasses fetch() by calling parsers directly on canned HTML.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
PROJECT = BASE.parent
sys.path.insert(0, str(BASE))


IIT_DELHI_FIXTURE = """
<!DOCTYPE html>
<html><body>
<h1>IIT Delhi Recruitment</h1>
<table>
<tr><th>S.No</th><th>Advertisement</th><th>Title</th><th>PDF</th><th>Closing Date</th></tr>
<tr>
  <td>Advt. No. IITD/R/2026/12</td>
  <td>Recruitment of Regular Faculty Positions across departments</td>
  <td><a href="/pdfs/advt-iitd-2026-12.pdf">Download PDF</a></td>
  <td>15 May 2026</td>
</tr>
<tr>
  <td>Advt. No. IITD/NT/2026/04</td>
  <td>Recruitment of Non-Teaching Staff (Section Officer / Junior Assistant)</td>
  <td><a href="/pdfs/advt-iitd-nt-2026-04.pdf">Download PDF</a></td>
  <td>30 April 2026</td>
</tr>
</table>
</body></html>
"""

JNU_FIXTURE = """
<!DOCTYPE html>
<html><body>
<h2>Recruitment Notices</h2>
<ul>
<li>Advt. No. JNU/Rectt/2026/03 — Faculty Recruitment (Assistant Professor) in multiple Schools.
<a href="/sites/default/files/adverts/JNU_Rectt_2026_03.pdf">View Advertisement</a>
</li>
<li>Advt. No. JNU/NT/2026/01 — Non-Teaching Ministerial Staff.
<a href="/sites/default/files/adverts/JNU_NT_2026_01.pdf">View</a>
</li>
</ul>
</body></html>
"""

GENERIC_FIXTURE = """
<!DOCTYPE html>
<html><body>
<h2>Employment Notice</h2>
<p>The Institute invites applications for the following positions.</p>
<p>Advertisement No. IIML/FAC/2026/7 — Faculty Recruitment (Guest Faculty).
Last date: 28 May 2026.
<a href="https://iiml.ac.in/assets/recruitment/iiml-fac-2026-7.pdf">Download advertisement PDF</a>
</p>
</body></html>
"""


def test_parsers():
    from parsers import iit_delhi, jnu, generic

    fetched_at = datetime.now(timezone.utc)

    ads_iitd = iit_delhi.parse(IIT_DELHI_FIXTURE, "https://home.iitd.ac.in/jobs.php", fetched_at)
    ads_jnu = jnu.parse(JNU_FIXTURE, "https://www.jnu.ac.in/recruitment", fetched_at)
    ads_generic = generic.parse(GENERIC_FIXTURE, "https://www.iiml.ac.in/careers", fetched_at)

    print(f"IIT Delhi parser → {len(ads_iitd)} ads")
    for ad in ads_iitd:
        print(f"  - {ad.title!r} closing={ad.closing_date} url={ad.original_url}")
    print(f"JNU parser → {len(ads_jnu)} ads")
    for ad in ads_jnu:
        print(f"  - {ad.title!r} advt={ad.ad_number} url={ad.original_url}")
    print(f"Generic parser → {len(ads_generic)} ads")
    for ad in ads_generic:
        print(f"  - {ad.title!r} advt={ad.ad_number} closing={ad.closing_date}")

    # Assertions
    assert len(ads_iitd) == 2, f"expected 2 IIT-Delhi ads, got {len(ads_iitd)}"
    assert len(ads_jnu) >= 2, f"expected >=2 JNU ads, got {len(ads_jnu)}"
    assert len(ads_generic) >= 1, f"expected >=1 generic ad, got {len(ads_generic)}"

    # Write to current.json as if run.py had produced them
    ads_all = []
    for ad, inst_id in [
        (ads_iitd[0], "iit-delhi"), (ads_iitd[1], "iit-delhi"),
        (ads_jnu[0], "jnu"), (ads_jnu[1], "jnu") if len(ads_jnu) > 1 else (None, None),
        (ads_generic[0], "iim-lucknow"),
    ]:
        if ad is None:
            continue
        d = ad.model_dump()
        d["institution_id"] = inst_id
        ads_all.append(d)

    out = PROJECT / "data" / "current.json"
    out.write_text(json.dumps(
        {"generated_at": fetched_at.isoformat(), "ad_count": len(ads_all), "ads": ads_all},
        indent=2, default=str, ensure_ascii=False
    ))

    cov = PROJECT / "data" / "coverage_report.json"
    cov.write_text(json.dumps({
        "generated_at": fetched_at.isoformat(),
        "institutions_attempted": 3,
        "institutions_succeeded": 3,
        "institutions_with_ads": 3,
        "ads_found_total": len(ads_all),
        "rows": [
            {"institution_id": "iit-delhi", "parser": "iit_delhi", "fetch_status": "ok", "http_status": 200, "ads_found": len(ads_iitd), "note": "fixture"},
            {"institution_id": "jnu", "parser": "jnu", "fetch_status": "ok", "http_status": 200, "ads_found": len(ads_jnu), "note": "fixture"},
            {"institution_id": "iim-lucknow", "parser": "generic", "fetch_status": "ok", "http_status": 200, "ads_found": len(ads_generic), "note": "fixture"},
        ],
    }, indent=2, default=str))

    print(f"\nWrote {len(ads_all)} ads to {out}")
    print(f"Wrote coverage report to {cov}")


if __name__ == "__main__":
    test_parsers()
