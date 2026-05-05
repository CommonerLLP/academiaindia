// tests/excerpt.test.js — sanitizeExcerpt covers the regression-prone
// scrape-junk patterns that have surfaced over the project's history.
// One test per institution-specific bug.

import { describe, it, expect } from "vitest";
import { sanitizeExcerpt, SUBSTANTIVE_MARKERS, INSTITUTIONAL_BOILERPLATE } from "../docs/lib/excerpt.js";

describe("sanitizeExcerpt — empty input", () => {
  it("returns '' for null/undefined/empty", () => {
    expect(sanitizeExcerpt(null)).toBe("");
    expect(sanitizeExcerpt(undefined)).toBe("");
    expect(sanitizeExcerpt("")).toBe("");
  });
});

describe("sanitizeExcerpt — Azim Premji template", () => {
  it("collapses or drops the 'Faculty Positions in X / We invite ...' template", () => {
    const input = "Faculty Positions in History We invite applications for faculty positions in History for our Undergraduate Programmes. Deadline: Sunday, 31 May 2026 Campus Bhopal";
    const out = sanitizeExcerpt(input);
    // After APU collapse the output is "For our Undergraduate Programmes."
    // — short and without a substantive marker, so the <60-char gate
    // suppresses it entirely. From the user's POV that's fine: the title
    // already carries "Faculty Positions in History" and the deadline is in
    // its own pill. Card simply omits the Description block.
    expect(out).not.toMatch(/Deadline/i);
    expect(out).not.toMatch(/Campus\s+Bhopal/i);
    expect(out).not.toMatch(/We invite applications/i);
  });

  it("preserves specialisation when present in APU template", () => {
    const input = "Faculty Positions in Biology We invite applications for faculty positions in Biology, specializing in Ecology and Evolutionary Biology for our Undergraduate Programmes. Campus Bhopal";
    const out = sanitizeExcerpt(input);
    expect(out.toLowerCase()).toContain("specializing in ecology");
  });

  it("collapses the calendar widget run", () => {
    const input = "Faculty Positions in Social Science We invite applications for faculty positions in Social Science for our Undergraduate Programmes. Deadline Add to Calendar × Add to Calendar iCal Google Outlook Outlook.com Yahoo Sunday, 31 May 2026 Campus Bhopal";
    const out = sanitizeExcerpt(input);
    expect(out).not.toMatch(/Add to Calendar/i);
    expect(out).not.toMatch(/iCal\s+Google\s+Outlook/i);
  });
});

describe("sanitizeExcerpt — FLAME institutional pitch", () => {
  it("returns '' when input is just the FLAME institutional prologue", () => {
    const input = "FLAME University, Pune (Maharashtra, India), is the pioneer of liberal education in India. With a strong focus on interdisciplinary research and teaching, the School of Liberal Education has recognized strengths in the areas of Psychology, Sociology, Public Policy, Economics, Philosophy, Literary and Cultural Studies, in addition to Environmental Sciences, Computer Science, Applied Mathematics and Humanities. The school offers undergraduate programs that allow students to gain rigorous interdisciplinary training";
    expect(sanitizeExcerpt(input)).toBe("");
  });
});

describe("sanitizeExcerpt — title-duplicate scrapes", () => {
  it("returns '' for 'X X' style halves duplication", () => {
    expect(sanitizeExcerpt("Faculty Recruitment  Faculty Recruitment")).toBe("");
    expect(sanitizeExcerpt("English  English")).toBe("");
    expect(sanitizeExcerpt("Recruitment Announcements  Recruitment Announcements")).toBe("");
  });
});

describe("sanitizeExcerpt — listing-row JSON fragment (Shiv Nadar)", () => {
  it("returns '' for 'pipe-pipe-pipe-Apply' patterns", () => {
    const input = "3675 | Assistant Professor - Design Engineering And Robotics School of Engineering (SoE) | Jun 30, 2026 | Apply";
    expect(sanitizeExcerpt(input)).toBe("");
  });
});

describe("sanitizeExcerpt — Devanagari masthead", () => {
  it("strips lines with Devanagari characters", () => {
    const input = "भारतीय प्रौद्योगिकी संस्थान\nApplications are invited for Assistant Professor positions in the Department of Sociology with research focus on caste, gender, and labour in modern India. The qualifications and experience required include a PhD with a strong record of publications.";
    const out = sanitizeExcerpt(input);
    expect(out).not.toMatch(/[ऀ-ॿ]/);
    expect(out).toContain("Sociology");
  });
});

describe("sanitizeExcerpt — substantive content passes through", () => {
  it("keeps a clean prose excerpt unchanged-ish", () => {
    const input = "Applications are invited for the post of Assistant Professor in the Department of History at IIT Madras. The candidate should have a PhD in History with research focus on early modern South Asia and a strong publication record.";
    const out = sanitizeExcerpt(input);
    expect(out).toContain("Assistant Professor");
    expect(out).toContain("PhD");
    expect(out.length).toBeGreaterThan(100);
  });

  it("rejects short non-substantive remnants", () => {
    expect(sanitizeExcerpt("Recruiters")).toBe("");
    expect(sanitizeExcerpt("Other Job Openings")).toBe("");
  });
});

describe("SUBSTANTIVE_MARKERS regex", () => {
  it("matches 'applications are invited'", () => {
    expect(SUBSTANTIVE_MARKERS.test("Applications are invited for ...")).toBe(true);
  });
  it("matches 'qualifications and experience'", () => {
    expect(SUBSTANTIVE_MARKERS.test("Qualifications and Experience required ...")).toBe(true);
  });
  it("does NOT match generic prose", () => {
    expect(SUBSTANTIVE_MARKERS.test("The university is committed to academic excellence.")).toBe(false);
  });
});

describe("INSTITUTIONAL_BOILERPLATE regex", () => {
  it("matches FLAME's 'pioneer of liberal education'", () => {
    expect(INSTITUTIONAL_BOILERPLATE.test("FLAME is the pioneer of liberal education in India")).toBe(true);
  });
  it("matches 'recognized strengths in the areas'", () => {
    expect(INSTITUTIONAL_BOILERPLATE.test("The School has recognized strengths in the areas of psychology")).toBe(true);
  });
  it("does NOT match unrelated prose", () => {
    expect(INSTITUTIONAL_BOILERPLATE.test("Applications are invited.")).toBe(false);
  });
});
