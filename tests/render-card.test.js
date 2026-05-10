// tests/render-card.test.js
// Smoke and safety tests for the user-facing listing-card renderer.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Window } from "happy-dom";

let renderCard;
let state;

beforeAll(async () => {
  ({ state } = await import("../docs/lib/state.js"));
  renderCard = await import("../docs/lib/render-card.js");
});

beforeEach(() => {
  localStorage.clear();
  state.SAVED = new Set();
  state.INSTITUTIONS = {
    "iit-delhi": {
      id: "iit-delhi",
      name: "Indian Institute of Technology Delhi",
      short_name: "IIT Delhi",
      type: "IIT",
      city: "Delhi",
      apply_url: "https://home.iitd.ac.in/jobs",
    },
    "ashoka": {
      id: "ashoka",
      name: "Ashoka University",
      short_name: "Ashoka",
      type: "PrivateUniversity",
      city: "Sonipat",
    },
  };
  state.ADS = [];
  document.body.innerHTML = `<span id="count-saved"></span><div id="host"></div>`;
});

describe("extractTraps", () => {
  it("detects exclusionary hiring clauses", () => {
    const traps = renderCard.extractTraps({
      title: "Faculty",
      unit_eligibility: "Applicants must have first class throughout all preceding degrees and certificates.",
      publications_required: "minimum five (5) publications in Scopus-indexed journals",
    });

    expect(traps.map(t => t.label)).toContain("First-class-throughout requirement");
    expect(traps.map(t => t.label)).toContain("High publication threshold + indexing requirement");
  });
});

describe("renderAd", () => {
  it("escapes scraped text and neutralizes unsafe apply URLs", () => {
    const ad = {
      id: "xss",
      institution_id: "iit-delhi",
      title: "Faculty — HSS — Sociology <script>alert(1)</script>",
      discipline: "Sociology <script>alert(1)</script>",
      post_type: "Faculty",
      original_url: "https://home.iitd.ac.in/jobs",
      apply_url: "javascript:alert(1)",
      raw_text_excerpt: "Applications invited in caste studies.",
      parse_confidence: 0.9,
    };
    state.ADS = [ad];

    const html = renderCard.renderAd(ad);
    expect(html).toContain("Sociology &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain('class="btn-apply" href="#"');
  });

  it("renders reservation status differently for public, private, and roster-count ads", () => {
    const publicAd = {
      id: "public",
      institution_id: "iit-delhi",
      title: "Faculty — Sociology",
      discipline: "Sociology",
      post_type: "Faculty",
      original_url: "https://home.iitd.ac.in/jobs-public",
    };
    const privateAd = { ...publicAd, id: "private", institution_id: "ashoka", original_url: "https://ashoka.edu/jobs" };
    const rosterAd = {
      ...publicAd,
      id: "roster",
      original_url: "https://home.iitd.ac.in/jobs-roster",
      category_breakdown: { UR: null, SC: 1, ST: null, OBC: 2, EWS: null, PwBD: null },
    };
    state.ADS = [publicAd, privateAd, rosterAd];

    expect(renderCard.renderAd(publicAd)).toContain("does not disclose enough post-wise roster information");
    expect(renderCard.renderAd(privateAd)).toContain("not known to implement affirmative action provisions");
    expect(renderCard.renderAd(rosterAd)).toContain("SC-1");
    expect(renderCard.renderAd(rosterAd)).toContain("OBC-2");
  });

  it("adds an Anna-specific cue for the events listing page", () => {
    const ad = {
      id: "anna",
      institution_id: "iit-delhi",
      title: "Research Position",
      discipline: "Chemical Engineering",
      post_type: "Research",
      original_url: "https://www.annauniv.edu/pdf/notice.pdf",
      info_url: "https://www.annauniv.edu/events.php",
    };

    const html = renderCard.renderAd(ad);
    expect(html).toContain("Listing page (open Recruitment tab) ↗");
  });

  it("wires save buttons to state and localStorage", () => {
    const ad = {
      id: "save-me",
      institution_id: "iit-delhi",
      title: "Faculty — Sociology",
      discipline: "Sociology",
      post_type: "Faculty",
      original_url: "https://home.iitd.ac.in/jobs",
    };
    state.ADS = [ad];
    const host = document.getElementById("host");
    host.innerHTML = renderCard.renderAd(ad);

    renderCard.wireAdActions(host);
    const button = host.querySelector(".star");
    button.click();

    expect(state.SAVED.has("save-me")).toBe(true);
    expect(button.textContent).toBe("★");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(document.getElementById("count-saved").textContent).toBe("1");
    expect(localStorage.getItem("hei-tracker-saved")).toBe('["save-me"]');
  });
});
