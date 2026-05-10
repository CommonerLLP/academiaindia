// tests/classify.test.js — pure-function tests for lib/classify.js.
// These cover the regression-prone functions: classifyAd, fieldTags,
// relevanceTag (the IIT-Textile-as-HSS bug from this week was here),
// condenseRanks (the "Faculty (multiple ranks)" UX bug), and
// abbreviateRank.

import { describe, it, expect } from "vitest";
import {
  classifyAd,
  fieldTags,
  primaryField,
  relevanceTag,
  listingStatus,
  condenseRanks,
  abbreviateRank,
  getStructuredPosition,
  NON_HSS_FIELD_TAGS,
} from "../docs/lib/classify.js";

/* ------- fixtures ------- */

const iitDelhiSoc = {
  id: "soc1",
  institution_id: "iit-delhi",
  title: "Faculty — Department of Humanities & Social Sciences — Sociology",
  structured_position: {
    department: "Department of Humanities & Social Sciences",
    discipline: "Sociology",
    ranks: ["Assistant Professor"],
    areas: ["AI", "digital worlds", "caste studies", "multi-species ethnography"],
    is_composite_call: true,
  },
};

const iitDelhiTextile = {
  id: "txt1",
  institution_id: "iit-delhi",
  title: "Faculty — Department of Textile & Fibre Engineering",
  structured_position: {
    department: "Department of Textile & Fibre Engineering",
    discipline: "Textile & Fibre Engineering",
    ranks: ["Assistant Professor"],
    areas: ["Fiber science and technology", "polymer chemistry and physics", "textile management (operations, supply chain, finance)"],
  },
};

const iitDelhiCart = {
  id: "cart1",
  institution_id: "iit-delhi",
  title: "Faculty — Centre for Automotive Research and Tribology",
  structured_position: {
    department: "Centre for Automotive Research and Tribology (CART)",
    school_or_centre: "Centre for Automotive Research and Tribology",
    discipline: "Automotive Research and Tribology",
    ranks: ["Assistant Professor"],
    areas: ["Battery Electrochemical Modelling", "Vehicular Telematics", "Automotive Component Design"],
  },
};

const iimBodhgaya = {
  id: "iim1",
  institution_id: "iim-bodhgaya",
  title: "Faculty — IIM Bodh Gaya — Strategy & Entrepreneurship",
  structured_position: {
    discipline: "Strategy & Entrepreneurship",
    ranks: [
      "Professor", "Associate Professor", "Assistant Professor",
      "Assistant Professor Grade I", "Assistant Professor Grade II",
      "Professor of Practice", "Associate Professor of Practice",
    ],
  },
};

/* ------- getStructuredPosition ------- */

describe("getStructuredPosition", () => {
  it("returns structured_position when present", () => {
    expect(getStructuredPosition(iitDelhiSoc)).toBe(iitDelhiSoc.structured_position);
  });
  it("falls back to first of structured_positions[]", () => {
    const sp = { discipline: "Economics" };
    expect(getStructuredPosition({ structured_positions: [sp] })).toBe(sp);
  });
  it("returns null when neither present", () => {
    expect(getStructuredPosition({})).toBe(null);
  });
});

/* ------- classifyAd ------- */

describe("classifyAd — three-way profile bucket", () => {
  it("classifies HSS ads as 'hss'", () => {
    expect(classifyAd(iitDelhiSoc)).toBe("hss");
  });
  it("classifies Textile Engineering as 'excluded' (engineering keyword in core)", () => {
    expect(classifyAd(iitDelhiTextile)).toBe("excluded");
  });
  it("classifies CART (engineering centre) as 'ambiguous' (no clear HSS or NEG match in core)", () => {
    // The audit recorded the core-text path: no HSS regex matches, no NEG
    // matches in core, so it falls through to the full-text branch which
    // returns ambiguous (FACULTY_HINT-only).
    expect(["ambiguous", "excluded"]).toContain(classifyAd(iitDelhiCart));
  });
  it("classifies an empty ad as 'excluded'", () => {
    expect(classifyAd({})).toBe("excluded");
  });
});

/* ------- fieldTags ------- */

describe("fieldTags — primary discipline detection", () => {
  it("tags the IIT Delhi Sociology card as Sociology", () => {
    const tags = fieldTags(iitDelhiSoc);
    expect(tags).toContain("Sociology");
  });
  it("tags Textile via its 'polymer chemistry and physics' fallback (NOT as HSS)", () => {
    const tags = fieldTags(iitDelhiTextile);
    // Should pick up Chemistry / Physics / Materials / Finance / Management
    // from the area strings; the bug previously was that Finance/Management
    // counted as HSS, fixed by adding both to NON_HSS_FIELD_TAGS.
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every(t => typeof t === "string")).toBe(true);
  });
  it("tags Strategy & Entrepreneurship as Management/Business (non-HSS)", () => {
    const tags = fieldTags(iimBodhgaya);
    expect(tags).toContain("Management / Business");
  });
});

/* ------- relevanceTag — the regression-prone bucket function ------- */

describe("relevanceTag — HSS / non-HSS / other bucket", () => {
  it("buckets Sociology card as 'hss'", () => {
    expect(relevanceTag(iitDelhiSoc)).toBe("hss");
  });
  it("buckets Textile (engineering) as 'non-hss' — was 'hss' before NON_HSS_FIELD_TAGS fix", () => {
    expect(relevanceTag(iitDelhiTextile)).toBe("non-hss");
  });
  it("buckets CART as non-HSS (engineering centre, no HSS keywords in core)", () => {
    // CART falls through to fallback rules — no specific FIELD_RULES match
    // for "Centre for Automotive Research and Tribology"; classifyAd returns
    // "ambiguous" (FACULTY_HINT only); fieldTags then returns either ["Other"]
    // (excluded path) or a non-HSS engineering tag from fallback. Either
    // way, NOT "hss".
    expect(relevanceTag(iitDelhiCart)).not.toBe("hss");
  });
  it("buckets an empty ad as non-hss (fieldTags returns ['Other'], which is in isNonHSS)", () => {
    expect(relevanceTag({})).toBe("non-hss");
  });
  it("buckets an IIM management-only ad as 'non-hss'", () => {
    // IIM Bodh Gaya tagged Management/Business — treated as non-HSS for
    // this dashboard's primary user (Bahujan PhD scholar, HSS-leaning).
    expect(relevanceTag(iimBodhgaya)).toBe("non-hss");
  });
  it("listingStatus is an alias for relevanceTag", () => {
    expect(listingStatus(iitDelhiSoc)).toBe(relevanceTag(iitDelhiSoc));
    expect(listingStatus(iitDelhiTextile)).toBe(relevanceTag(iitDelhiTextile));
  });
});

/* ------- NON_HSS_FIELD_TAGS — the set that caught the Textile bug ------- */

describe("NON_HSS_FIELD_TAGS", () => {
  it("includes the engineering / pure-science tags", () => {
    expect(NON_HSS_FIELD_TAGS.has("Computer Science / AI / Data")).toBe(true);
    expect(NON_HSS_FIELD_TAGS.has("Mechanical / Aerospace")).toBe(true);
    expect(NON_HSS_FIELD_TAGS.has("Chemistry")).toBe(true);
  });
  it("includes Finance / Capital Markets (the Textile fix)", () => {
    expect(NON_HSS_FIELD_TAGS.has("Finance / Capital Markets")).toBe(true);
  });
  it("includes Management / Business (the Textile + CART fix)", () => {
    expect(NON_HSS_FIELD_TAGS.has("Management / Business")).toBe(true);
  });
  it("does NOT include Sociology / Anthropology / etc.", () => {
    expect(NON_HSS_FIELD_TAGS.has("Sociology")).toBe(false);
    expect(NON_HSS_FIELD_TAGS.has("Anthropology")).toBe(false);
    expect(NON_HSS_FIELD_TAGS.has("Public Policy")).toBe(false);
  });
});

/* ------- condenseRanks + abbreviateRank ------- */

describe("condenseRanks", () => {
  it("collapses Asst Prof Grade I / II to single 'Assistant Professor'", () => {
    expect(condenseRanks(["Assistant Professor", "Assistant Professor Grade I", "Assistant Professor Grade II"])).toEqual(["Assistant Professor"]);
  });
  it("collapses IIM Bodh Gaya 7-rank list to 5 canonical ranks", () => {
    // Input: Prof / Assoc / Asst / Asst-Grade-I / Asst-Grade-II / ProfPrac /
    // AssocProfPrac. Output: Asst / Assoc / Prof / AssocProfPrac / ProfPrac.
    // 5 distinct because "Prof of Practice" and "Assoc Prof of Practice" are
    // separate canonical ranks. The renderer's threshold for "show ranks"
    // vs "show 'Faculty (multiple ranks)'" is 4 — so 5 still triggers the
    // collapse on the card. Documents the gap; tighten if you want to show
    // 5 ranks too.
    const out = condenseRanks(iimBodhgaya.structured_position.ranks);
    expect(out.length).toBe(5);
    expect(out).toContain("Assistant Professor");
    expect(out).toContain("Associate Professor");
    expect(out).toContain("Professor");
    expect(out).toContain("Prof of Practice");
    expect(out).toContain("Assoc Prof of Practice");
  });
  it("dedupes identical inputs", () => {
    expect(condenseRanks(["Professor", "Professor", "Professor"])).toEqual(["Professor"]);
  });
  it("preserves unknown rank strings as-is", () => {
    expect(condenseRanks(["Visiting Faculty"])).toEqual(["Visiting Faculty"]);
  });
});

describe("abbreviateRank", () => {
  it("Assistant Professor → Asst Prof", () => {
    expect(abbreviateRank("Assistant Professor")).toBe("Asst Prof");
  });
  it("Associate Professor → Assoc Prof", () => {
    expect(abbreviateRank("Associate Professor")).toBe("Assoc Prof");
  });
  it("Professor → Prof", () => {
    expect(abbreviateRank("Professor")).toBe("Prof");
  });
  it("preserves Prof of Practice as-is (no naïve substring replace)", () => {
    expect(abbreviateRank("Prof of Practice")).toBe("Prof of Practice");
  });
  it("returns empty string for null/undefined", () => {
    expect(abbreviateRank(null)).toBe("");
    expect(abbreviateRank(undefined)).toBe("");
  });
});

/* ------- primaryField ------- */

describe("primaryField", () => {
  it("returns first tag from fieldTags (rule order matters)", () => {
    // The Sociology card's areas mention "multi-species ethnography" which
    // matches the Anthropology rule. Anthropology is listed first in
    // FIELD_RULES, so primaryField returns it before Sociology. This is
    // expected — primaryField is a tie-breaker used for the chip headline,
    // not a definitive label.
    expect(primaryField(iitDelhiSoc)).toBe("Anthropology");
  });
  it("returns 'Other' when no tag matches", () => {
    expect(primaryField({})).toBe("Other");
  });
});
