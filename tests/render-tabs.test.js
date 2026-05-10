// tests/render-tabs.test.js
// Smoke tests for Saved and Coverage tab rendering.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";

let tabs;
let state;

beforeAll(async () => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async () => {} } },
  });
  ({ state } = await import("../docs/lib/state.js"));
  tabs = await import("../docs/lib/render-tabs.js");
});

beforeEach(() => {
  localStorage.clear();
  state.SAVED = new Set();
  state.ADS = [];
  state.COVERAGE = null;
  state.INSTITUTIONS = {
    "iit-delhi": {
      id: "iit-delhi",
      name: "Indian Institute of Technology Delhi",
      short_name: "IIT Delhi",
      type: "IIT",
      city: "Delhi",
    },
  };
  document.body.innerHTML = `
    <span id="count-saved"></span>
    <div id="saved-tab"></div>
    <div id="resources-tab"></div>
    <div id="coverage-summary"></div>
    <table id="coverage-table"><tbody></tbody></table>
  `;
});

describe("renderSaved", () => {
  it("renders an empty watchlist state", () => {
    tabs.renderSaved();
    expect(document.getElementById("saved-tab").textContent).toContain("No saved advertisements yet");
  });

  it("renders saved ads only", () => {
    state.ADS = [
      {
        id: "saved",
        institution_id: "iit-delhi",
        title: "Faculty — Sociology",
        discipline: "Sociology",
        post_type: "Faculty",
        original_url: "https://home.iitd.ac.in/jobs",
      },
      {
        id: "unsaved",
        institution_id: "iit-delhi",
        title: "Faculty — Physics",
        discipline: "Physics",
        post_type: "Faculty",
        original_url: "https://home.iitd.ac.in/jobs",
      },
    ];
    state.SAVED = new Set(["saved"]);

    tabs.renderSaved();
    const text = document.getElementById("saved-tab").textContent;
    expect(text).toContain("1 saved advertisement");
    expect(text).toContain("Sociology");
    expect(text).not.toContain("Physics");
  });
});

describe("renderCoverage", () => {
  it("renders coverage KPIs and escapes row notes", () => {
    state.COVERAGE = {
      generated_at: "2026-05-05T00:00:00Z",
      institutions_attempted: 2,
      ads_found_total: 7,
      rows: [
        {
          institution_id: "iit-delhi",
          parser: "iit_delhi",
          fetch_status: "ok",
          http_status: 200,
          ads_found: 7,
          note: "<script>alert(1)</script>",
        },
        {
          institution_id: "missing",
          parser: "generic",
          fetch_status: "parser-error",
          http_status: 500,
          ads_found: 0,
          note: "broken",
        },
      ],
    };

    tabs.renderCoverage();
    expect(document.getElementById("coverage-summary").textContent).toContain("Total ads");
    expect(document.getElementById("coverage-summary").textContent).toContain("7");
    const tableHTML = document.querySelector("#coverage-table tbody").innerHTML;
    expect(tableHTML).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(tableHTML).not.toContain("<script>alert(1)</script>");
  });
});
