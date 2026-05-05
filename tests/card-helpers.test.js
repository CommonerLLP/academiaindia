// tests/card-helpers.test.js
// High-risk display helpers used by the listing-card path.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

let helpers;
let state;

beforeAll(async () => {
  globalThis.localStorage = {
    store: {},
    getItem(key) { return this.store[key] ?? null; },
    setItem(key, value) { this.store[key] = String(value); },
    clear() { this.store = {}; },
  };
  ({ state } = await import("../docs/lib/state.js"));
  helpers = await import("../docs/lib/card-helpers.js");
});

beforeEach(() => {
  state.INSTITUTIONS = {
    "iit-bombay": { id: "iit-bombay", name: "IIT Bombay", type: "IIT", city: "Mumbai" },
    "apu": { id: "apu", name: "Azim Premji University", type: "PrivateUniversity", city: "Bengaluru" },
  };
});

describe("campus and unit display", () => {
  it("detects campus names from ad text", () => {
    expect(helpers.detectAdCampus({ title: "Faculty Positions", raw_text_excerpt: "Position based in Bhopal." })).toBe("Bhopal");
    expect(helpers.detectAdCampus({ title: "Ranchi Campus — Faculty", raw_text_excerpt: "" })).toBe("Ranchi");
  });

  it("does not hide campus for multi-campus brands", () => {
    expect(helpers.cityAlreadyInInstitutionName("IIT Delhi", "Delhi")).toBe(true);
    expect(helpers.cityAlreadyInInstitutionName("Azim Premji University", "Bhopal")).toBe(false);
  });

  it("normalizes public technical department names through overrides", () => {
    expect(helpers.normalizeRecruitingUnitName("aerospace engineering", { institution_id: "iit-bombay" }))
      .toBe("Department of Aerospace Engineering");
  });

  it("builds discipline-first card labels from structured positions", () => {
    const ad = {
      institution_id: "iit-bombay",
      department: "Humanities and Social Sciences",
      discipline: "Sociology",
      structured_position: {
        department: "Humanities and Social Sciences",
        discipline: "Sociology",
      },
    };
    expect(helpers.cardDiscipline(ad)).toBe("Department of Humanities and Social Sciences — Sociology");
  });
});

describe("rank and source labels", () => {
  it("condenses structured ranks and maps TenureTrack to Permanent", () => {
    const ad = {
      structured_position: {
        ranks: ["Assistant Professor", "Associate Professor", "Professor"],
        contract_status: "TenureTrack",
      },
    };
    expect(helpers.cardRankLine(ad)).toBe("Asst Prof / Assoc Prof / Prof · Permanent");
  });

  it("keeps visiting faculty distinct from permanent faculty", () => {
    expect(helpers.cardRankLine({ post_type: "Visiting", title: "Visiting Faculty" })).toBe("Visiting Faculty");
    expect(helpers.isVisitingMatch({ post_type: "Visiting", title: "Visiting Faculty" })).toBe(true);
    expect(helpers.isAsstProfMatch({ post_type: "Visiting", title: "Visiting Faculty" })).toBe(false);
  });

  it("surfaces provenance labels for PDFs and carry-forward records", () => {
    expect(helpers.sourceLabel({ _pdf_parsed: true })).toBe("verified PDF");
    expect(helpers.sourceLabel({ _source_method: "stale carry-forward" })).toBe("carried forward");
    expect(helpers.sourceLinkLabel({ original_url: "https://example.org/ad.pdf" })).toBe("Original PDF →");
  });
});

describe("cue extraction", () => {
  it("extracts numbered area lists and eligibility/evaluation cues", () => {
    const text = `
      Areas of specialization: (i) Caste and technology (ii) Digital societies (iii) Public policy.
      Applicants must have a Ph.D. with first class preceding degree.
      At least 5 publications in peer-reviewed journals expected. Potential for good teaching.
    `;
    const cues = helpers.extractCardCues(text);

    expect(cues.areas).toContain("Caste and technology");
    expect(cues.areas).toContain("Digital societies");
    expect(cues.eligibility).toContain("PhD + first class preceding degree");
    expect(cues.evaluation).toContain("Publications: 5+");
    expect(cues.evaluation).toContain("Teaching potential assessed");
  });

  it("prefers structured cues when structured_position is present", () => {
    const cues = helpers.structuredCues({
      structured_position: {
        areas: ["Caste studies", "Digital ethnography"],
        methods_preference: "ethnography",
        qualifications: {
          phd: "required",
          post_phd_experience_years: 2,
          publications_required: "three peer-reviewed articles",
        },
      },
    });

    expect(cues.areas).toEqual(["Caste studies", "Digital ethnography"]);
    expect(cues.methods).toBe("ethnography");
    expect(cues.eligibility).toContain("2y post-PhD experience");
    expect(cues.evaluation).toContain("three peer-reviewed articles");
  });
});
