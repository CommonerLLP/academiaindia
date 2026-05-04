"""Hand-curated HSS-relevant faculty positions at IIT Delhi and IIT Bombay.

The institutional career-page parsers (iit_delhi, generic-fallback for iit_bombay)
miss these because the substance lives in linked PDF rolling-advertisements, not
in the HTML listing. Until those parsers are upgraded, this module injects
curated records sourced directly from the current rolling ads. IIT Madras is
intentionally NOT included — its 2026 H&SS rolling ad lists only IKS and
Economics, both outside the user's profile.

Run after `scraper/run.py`. It strips any prior `_curated_iit` ads and re-adds
the current set, so reruns are idempotent.

Sources: snapshotted PDFs at the URLs listed in each entry. Closing dates are
omitted because IIT rolling ads remain open until the next revision is posted —
a closing-date in the dashboard would falsely imply discrete deadline pressure.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path


# ---- Institution-level boilerplate that applies to every position at that
#      institute. Folded in to each ad as `general_eligibility` and `apply_url`
#      so the listing card is self-contained. Pulled directly from each PDF +
#      the rolling-ad page metadata.
GENERAL = {
    "iit-delhi": {
        "apply_url": "https://ecampus.iitd.ac.in/IITDFR-0/login",
        "info_url": "https://home.iitd.ac.in/jobs-iitd/index.php",
        "general_eligibility": (
            "PhD with first class (or equivalent) in the preceding degree. Grade-I: ≥3 years "
            "post-PhD industrial/research/teaching experience. Grade-II: PhD with <3 years "
            "experience. Age preferably below 35 (relaxations per GoI norms)."
        ),
        "reservation": (
            "CEI(RTC) Act 2019 applies: SC 15%, ST 7.5%, OBC(NCL) 27%, EWS 10%, PwBD 4%. "
            "Foreign nationals appointed on 5-year renewable contract."
        ),
        "process": (
            "Apply online at the IITD recruitment portal. Separate application required for "
            "each academic unit. Cycle considered: 1 May 2025 — 30 June 2026."
        ),
        "contact": "Faculty Recruitment Cell, IIT Delhi · fac_recruit@admin.iitd.ac.in · +91-11-2654-8733",
    },
    "iit-bombay": {
        "apply_url": "https://portal.iitb.ac.in/FR/index.php/FAC/FR26/user/account",
        "info_url": "https://www.iitb.ac.in/job-vacancy-ad/rolling-advertisement-no-l-1025-26",
        "general_eligibility": (
            "Asst Prof Grade I: PhD with first class (or equivalent) in preceding degree, plus "
            "≥3 years post-PhD industrial/research/teaching experience. Grade II: PhD with "
            "<3 years experience. Detailed publication thresholds vary per academic unit."
        ),
        "reservation": "CEI(RTC) Act 2019 applies for SC/ST/OBC-NCL/EWS; RPwD Act 2016 for PwBD.",
        "process": "Rolling advertisement; applications processed periodically. Apply online via the IITB Faculty Recruitment portal.",
        "contact": "facrec@iitb.ac.in",
    },
}


CURATED: list[dict] = [
    # ---- IIT Delhi: AP-1 2026 (Updated 23 Apr 2026) ----
    {
        "institution_id": "iit-delhi",
        "closing_date": "2026-06-30",
        "ad_number": "IITD/2026/AP-1",
        "title": "Assistant Professor — Sociology (caste, ethnography, queer, multi-species, AI/digital worlds, mobility)",
        "department": "Department of Humanities & Social Sciences",
        "discipline": "Sociology / Anthropology",
        "publication_date": "2026-04-23",
        "raw_text": (
            "AI, digital worlds, markets, waste, queer studies, multi-species ethnography, "
            "caste studies, mobility and class. Sociological/anthropological approach with "
            "ethnographic or quantitative methods. Must teach core sociological/anthropological "
            "theory and methods."
        ),
        "unit_eligibility": "Specialisation must be clearly evidenced through publications. Must teach core sociological/anthropological theory + methods beyond own research area.",
        "publications_required": "See HSS Annexure-III in the AP-1 PDF (general HSS publications standard applies).",
    },
    {
        "institution_id": "iit-delhi",
        "closing_date": "2026-06-30",
        "ad_number": "IITD/2026/AP-1",
        "title": "Assistant Professor — Technology-in-Society (STS)",
        "department": "Department of Humanities & Social Sciences",
        "discipline": "Science and Technology Studies",
        "publication_date": "2026-04-23",
        "raw_text": (
            "Strong background in Science and Technology Studies or allied disciplines within "
            "the humanities and social sciences with a strong research focus on the social "
            "study of technology."
        ),
        "unit_eligibility": "PhD in STS or allied HSS discipline; demonstrated research on the social study of technology.",
        "publications_required": "See HSS Annexure-III in the AP-1 PDF.",
    },
    {
        "institution_id": "iit-delhi",
        "closing_date": "2026-06-30",
        "ad_number": "IITD/2026/AP-1",
        "title": "Assistant Professor — Public Policy (Science, Technology & Innovation)",
        "department": "School of Public Policy (SoPP)",
        "discipline": "Science, Technology & Innovation policy",
        "publication_date": "2026-04-23",
        "raw_text": (
            "Public policy with a broad focus on Science, Technology & Innovation (STI) and "
            "Development. Areas: Agriculture/Food/Water; Health innovations & systems; "
            "Industry & Economy; Innovation Systems & Processes; Internet, Digital Information "
            "& Society; Sustainable Habitats; Technical Higher Education."
        ),
        "unit_eligibility": (
            "PhD with 3 years experience (excl. PhD years) for Grade I; for Grade II post-PhD "
            "experience desirable but not required. Max age 35 (M)/38 (F), with relaxations."
        ),
        "publications_required": (
            "≥4 high-quality S&T-policy-oriented papers in reputed peer-reviewed venues. A "
            "single-author scholarly book may count as up to 5 journal articles; an edited "
            "chapter as up to 1 article (subject to quality/relevance review)."
        ),
    },
    {
        "institution_id": "iit-delhi",
        "closing_date": "2026-06-30",
        "ad_number": "IITD/2026/AP-1",
        "title": "Assistant Professor — Design (all areas)",
        "department": "Department of Design",
        "discipline": "Design",
        "publication_date": "2026-04-23",
        "raw_text": (
            "All areas of design. Open to candidates with high quality of design practice "
            "(Design Research, Design Market, etc.) demonstrated through publications."
        ),
        "unit_eligibility": (
            "PhD in Design (or related). Up to 5-year experience relaxation possible if "
            "exceptional design-practice outputs are demonstrated (Design Research, Design "
            "Market, etc.)."
        ),
        "publications_required": "Research publications of reputable quality, OR documented design-practice outputs accepted as equivalent.",
    },
    # ---- IIT Bombay: Rolling Advertisement L-10/25-26 ----
    {
        "institution_id": "iit-bombay",
        "closing_date": "2026-12-31",
        "ad_number": "IITB/L-10/25-26",
        "title": "Faculty (Asst/Assoc/Prof) — Public Policy",
        "department": "Ashank Desai Centre for Policy Studies (ADCPS)",
        "discipline": "Public Policy",
        "publication_date": "2026-04-01",
        "raw_text": (
            "Digital Societies and Governance; Social Policy (with focus on Health); Urban "
            "Policy; Technology and Policy; Water/Sanitation/Energy/Climate Change; "
            "Industrial and Economic Policy."
        ),
        "unit_eligibility": "Demonstrated experience in one of the six policy research areas. Institute general eligibility (PhD + first class) applies.",
        "publications_required": (
            "Asst Prof: ≥3 policy-relevant publications in reputed indexed journals "
            "(Scopus/SCI, JSTOR, Sage, MUSE, ABDC). One peer-reviewed book chapter/monograph "
            "from a reputed publisher = 1 publication. Assoc Prof: ≥8 publications total, 5 "
            "in journals; ≥5 policy-relevant in the assessment period, 3 in journals."
        ),
    },
    {
        "institution_id": "iit-bombay",
        "closing_date": "2026-12-31",
        "ad_number": "IITB/L-10/25-26",
        "title": "Faculty (Asst/Assoc/Prof) — Development, Technology, and Society",
        "department": "Centre for Technology Alternatives for Rural Areas (C-TARA)",
        "discipline": "Development / STS",
        "publication_date": "2026-04-01",
        "raw_text": (
            "Science and Technology applications towards sustainable development. Public "
            "Policy and Governance; Development, Technology, and Society; Technology, "
            "Development, and Dissemination; Inclusive Design, Innovation and Entrepreneurship "
            "in the Rural Context."
        ),
        "unit_eligibility": "Strong focus on S&T applications for sustainable development. Institute general eligibility applies.",
        "publications_required": (
            "Asst Prof: high-quality research evidenced by publications, book chapters, "
            "patents, and case studies. Assoc Prof: ≥10 publications in Scopus/SCI total; "
            "≥6 in the assessment period (≥3 in international peer-reviewed journals; "
            "remainder may be book chapters / conference proceedings / granted patents / "
            "case studies/monographs). Must have guided ≥6 Master's students."
        ),
    },
    {
        "institution_id": "iit-bombay",
        "closing_date": "2026-12-31",
        "ad_number": "IITB/L-10/25-26",
        "title": "Faculty (Asst/Assoc/Prof) — Educational Technology / Learning Sciences",
        "department": "Centre for Educational Technology",
        "discipline": "Learning Sciences",
        "publication_date": "2026-04-01",
        "raw_text": (
            "Technology enhanced learning environments. Discipline based education research; "
            "learning sciences and cognition; learner modeling; teacher use of educational "
            "technology; assessment and evaluation; technology for foundational literacy and "
            "numeracy; social justice research in the context of technology enhanced learning."
        ),
        "unit_eligibility": (
            "If PhD is in a non-ET discipline, candidate must have a post-doc in ET or "
            "ET-related publications, or have run development projects in ET."
        ),
        "publications_required": (
            "Asst Prof: ≥2 ET-related publications in Scopus/SCI journals OR 1 such journal "
            "publication + 2 publications in dept-identified conferences. Must be first author "
            "on at least one. Post-PhD: average ≥1 publication per year (PhD-based papers "
            "count). Up to 2 years of industry/non-publishing positions exempted."
        ),
    },
    {
        "institution_id": "iit-bombay",
        "closing_date": "2026-12-31",
        "ad_number": "IITB/L-10/25-26",
        "title": "Faculty (Asst/Assoc/Prof) — Interaction / Service / Game Design",
        "department": "IDC School of Design",
        "discipline": "Design",
        "publication_date": "2026-04-01",
        "raw_text": (
            "Industrial Design, Mobility & Vehicle Design, 3D Animation, Interaction Design, "
            "Game Design, Service Design."
        ),
        "unit_eligibility": (
            "Asst Prof Grade I: postgraduate Degree/Diploma in Design / Arts / Applied Arts, "
            "OR a postgraduate Degree in Engineering / Architecture / Humanities (or equiv). "
            "Without a PhD: ≥8 years teaching/research/professional experience required, "
            "with PhD to be obtained within 5 years of joining. Assoc Prof: PhD + ≥6 years "
            "experience post-PhD, ≥3 years at Asst Prof Grade I level."
        ),
        "publications_required": "Excellent record of publications in reputed journals (specifics depend on rank).",
    },
]


SOURCE_PDFS = {
    "iit-delhi": "https://home.iitd.ac.in/jobs-iitd/uploads/Updated%20Rollling%20Advt.%20IITD%202026%20AP-1%20-%2023.4.2026.pdf",
    "iit-bombay": "https://www.iitb.ac.in/sites/www.iitb.ac.in/files/2026-01/Areas%20of%20Specialization%20for%20Rolling%20Advertisement%20No.L-10.pdf",
}


def stable_id(*parts: str) -> str:
    """Delegate to the canonical implementation in `ad_factory.stable_id`.

    Was: a private duplicate that crashed on `None` parts (used `p.encode(...)`
    directly while every other definition in the repo handles None via
    `(p or "").encode(...)`). Since `ad_number`, `department`, `discipline`
    are all nullable in the schema, that bug was a latent crash in the
    curated parser. Fixed by importing the canonical version so there is
    exactly one definition.
    """
    from ad_factory import stable_id as _canonical
    return _canonical(*parts)


def build_ad(rec: dict, fetched_at: str) -> dict:
    return {
        "id": stable_id("curated", rec["institution_id"], rec["title"]),
        "institution_id": rec["institution_id"],
        "ad_number": rec["ad_number"],
        "title": rec["title"],
        "department": rec["department"],
        "discipline": rec["discipline"],
        "post_type": "Faculty",
        "contract_status": "TenureTrack",
        "category_breakdown": None,
        "number_of_posts": None,
        "pay_scale": None,
        "publication_date": rec["publication_date"],
        "closing_date": rec.get("closing_date"),
        "original_url": SOURCE_PDFS[rec["institution_id"]],
        "snapshot_fetched_at": fetched_at,
        "parse_confidence": 1.0,
        "raw_text_excerpt": rec["raw_text"],
        "_curated_iit": True,
        "unit_eligibility": rec.get("unit_eligibility"),
        "publications_required": rec.get("publications_required"),
        "general_eligibility": GENERAL[rec["institution_id"]]["general_eligibility"],
        "reservation_note": GENERAL[rec["institution_id"]]["reservation"],
        "process_note": GENERAL[rec["institution_id"]]["process"],
        "apply_url": GENERAL[rec["institution_id"]]["apply_url"],
        "info_url": GENERAL[rec["institution_id"]]["info_url"],
        "contact": GENERAL[rec["institution_id"]]["contact"],
    }


def main() -> None:
    base = Path(__file__).resolve().parents[1]
    cur = base / "data" / "current.json"
    payload = json.loads(cur.read_text())
    fetched_at = datetime.now(timezone.utc).isoformat()

    # Strip prior curated entries for idempotent reruns. Also strip the noisy
    # generic-parser ads at iit-delhi/iit-bombay/iit-madras because they're
    # almost entirely wayfinding links, not real postings.
    NOISE_INSTS = {"iit-delhi", "iit-bombay", "iit-madras"}
    before = len(payload.get("ads", []))
    payload["ads"] = [
        a for a in payload.get("ads", [])
        if not a.get("_curated_iit") and a.get("institution_id") not in NOISE_INSTS
    ]
    stripped = before - len(payload["ads"])

    for rec in CURATED:
        payload["ads"].append(build_ad(rec, fetched_at))

    payload["ad_count"] = len(payload["ads"])
    payload["generated_at"] = fetched_at
    cur.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str))

    print(f"Stripped {stripped} prior IIT-Delhi/Bombay/Madras + curated ads")
    print(f"Added {len(CURATED)} curated IIT HSS ads")
    print(f"Total ads now: {payload['ad_count']}")


if __name__ == "__main__":
    main()
