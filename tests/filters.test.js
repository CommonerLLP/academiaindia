// tests/filters.test.js
// Faceted filtering/search behaviour for docs/lib/filters.js.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";

let filters;
let state;

function installBrowserShims() {
  const win = new Window();
  globalThis.window = win;
  globalThis.document = win.document;
}

function makeControls() {
  document.body.innerHTML = `
    <input id="search" value="" />
    <select id="sort"><option value="closing">closing</option><option value="inst">inst</option></select>
    <div id="filter-hss"><label><input type="checkbox" value="Sociology" /><span class="cnt"></span></label></div>
    <div id="filter-quality"><label><input type="checkbox" value="hss" /><span class="cnt"></span></label></div>
    <div id="filter-type"><label><input type="checkbox" value="IIT" /><span class="cnt"></span></label></div>
    <div id="filter-posgroup"><label><input type="checkbox" value="research" /><span class="cnt"></span></label></div>
    <div id="filter-state"><label><input type="checkbox" value="Delhi" /><span class="cnt"></span></label></div>
  `;
}

beforeAll(async () => {
  installBrowserShims();
  ({ state } = await import("../docs/lib/state.js"));
  filters = await import("../docs/lib/filters.js");
});

beforeEach(() => {
  localStorage.clear();
  makeControls();
  window._closingSoonOnly = false;
  window._reservedOnly = false;
  state.ADS = [
    {
      id: "socio",
      institution_id: "iit-delhi",
      title: "Faculty — HSS — Sociology",
      discipline: "Sociology",
      post_type: "Faculty",
      category_breakdown: { UR: null, SC: 1, ST: null, OBC: null, EWS: null, PwBD: null },
    },
    {
      id: "ml",
      institution_id: "flame",
      title: "Postdoctoral Fellow — Machine Learning",
      discipline: "Computer Science",
      post_type: "Research",
      structured_position: { areas: ["machine learning", "AI policy"] },
    },
    {
      id: "biz",
      institution_id: "iim-b",
      title: "Faculty — Strategy & Entrepreneurship",
      discipline: "Strategy & Entrepreneurship",
      post_type: "Faculty",
    },
  ];
  state.INSTITUTIONS = {
    "iit-delhi": { id: "iit-delhi", name: "IIT Delhi", type: "IIT", state: "Delhi" },
    flame: { id: "flame", name: "FLAME University", type: "PrivateUniversity", state: "Maharashtra" },
    "iim-b": { id: "iim-b", name: "IIM Bangalore", type: "IIM", state: "Karnataka" },
  };
});

describe("filterHaystack", () => {
  it("indexes institution and structured-position area text", () => {
    const got = filters.filterHaystack(state.ADS[1], state.INSTITUTIONS.flame);
    expect(got).toContain("flame university");
    expect(got).toContain("machine learning");
    expect(got).toContain("ai policy");
  });
});

describe("applyFilters", () => {
  it("filters by field, type, state, position group, query, and reserved toggle", () => {
    let st = {
      query: "",
      fields: new Set(["Sociology"]),
      statuses: new Set(),
      types: new Set(["IIT"]),
      posGroups: new Set(),
      states: new Set(["Delhi"]),
      sort: "closing",
    };
    expect(filters.applyFilters(st).map(ad => ad.id)).toEqual(["socio"]);

    st = { ...st, fields: new Set(), types: new Set(), states: new Set(), posGroups: new Set(["research"]) };
    expect(filters.applyFilters(st).map(ad => ad.id)).toEqual(["ml"]);

    st = { ...st, posGroups: new Set(), query: "ML policy" };
    expect(filters.applyFilters(st).map(ad => ad.id)).toEqual(["ml"]);

    window._reservedOnly = true;
    st = { ...st, query: "" };
    expect(filters.applyFilters(st).map(ad => ad.id)).toEqual(["socio"]);
  });

  it("sorts institution names without mutating the input array", () => {
    const input = [state.ADS[0], state.ADS[1], state.ADS[2]];
    const sorted = filters.applySort(input, "inst");
    expect(sorted.map(ad => ad.id)).toEqual(["ml", "biz", "socio"]);
    expect(input.map(ad => ad.id)).toEqual(["socio", "ml", "biz"]);
  });
});

describe("currentFilterState and reactive counts", () => {
  it("reads DOM filter controls and paints cross-facet counts", () => {
    document.querySelector("#filter-hss input").checked = true;
    document.getElementById("search").value = "sociology";

    const st = filters.currentFilterState();
    expect(st.query).toBe("sociology");
    expect([...st.fields]).toEqual(["Sociology"]);

    filters.updateReactiveCounts(st);
    expect(document.querySelector("#filter-type .cnt").textContent).toBe("1");
    expect(document.querySelector("#filter-state .cnt").textContent).toBe("1");
  });
});
