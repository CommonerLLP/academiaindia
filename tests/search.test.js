// tests/search.test.js
// Batch 5 lexical search decision: aliases before embeddings.

import { describe, expect, it } from "vitest";
import {
  expandSearchAliases,
  matchesSearch,
  normalizeSearchText,
  queryTokens,
} from "../docs/lib/search.js";

describe("normalizeSearchText", () => {
  it("normalizes punctuation, case, accents, and ampersands", () => {
    expect(normalizeSearchText("Post-doc: AI & Society")).toBe("post doc ai and society");
  });
});

describe("expandSearchAliases", () => {
  it("expands common academic-job vocabulary mismatches", () => {
    expect(expandSearchAliases("Machine Learning post-doctoral fellowship")).toContain("ml");
    expect(expandSearchAliases("STS faculty")).toContain("science and technology studies");
    expect(expandSearchAliases("PwBD roster")).toContain("persons with benchmark disabilities");
  });
});

describe("matchesSearch", () => {
  it("matches post-doc and postdoc variants", () => {
    expect(matchesSearch("Postdoctoral Fellow in Sociology", "post-doc")).toBe(true);
    expect(matchesSearch("Post-doc in Sociology", "postdoc")).toBe(true);
  });

  it("matches ML and machine learning variants without embeddings", () => {
    expect(matchesSearch("Faculty position in machine learning and public policy", "ML policy")).toBe(true);
    expect(matchesSearch("ML methods for social science", "machine learning")).toBe(true);
  });

  it("matches STS abbreviation and expanded phrase", () => {
    expect(matchesSearch("Science and Technology Studies, caste and infrastructure", "STS caste")).toBe(true);
    expect(matchesSearch("STS and digital society", "science technology studies")).toBe(true);
  });

  it("keeps STS as a concept instead of broad science/technology tokens", () => {
    expect(matchesSearch("Faculty in Computer Science and Technology", "STS")).toBe(false);
    expect(matchesSearch("Science and Technology Studies", "STS")).toBe(true);
  });

  it("keeps short tokens exact so AI does not match ordinary words", () => {
    expect(matchesSearch("Chair in anthropology", "AI")).toBe(false);
    expect(matchesSearch("AI and society", "AI")).toBe(true);
  });

  it("requires all query terms after alias expansion", () => {
    expect(queryTokens("ML policy")).toContain("ml");
    expect(matchesSearch("Machine learning methods", "ML policy")).toBe(false);
  });
});
