// docs/lib/filters.js — filter, search, sort, and reactive-facet logic.
//
// This module owns the data path from "raw state.ADS array" to "filtered +
// sorted slice that gets rendered". The functions here are pure-ish: they
// read state.ADS / state.INSTITUTIONS but never mutate them, and they read
// DOM only for filter-control values (checkboxes + search input + sort
// select). updateReactiveCounts is the exception — it writes count text
// + opacity onto filter-strip labels so the user sees how many ads match
// each option given the rest of the active selection.
//
// Cross-cutting flags `window._closingSoonOnly` and `window._reservedOnly`
// are not in `st` because the chips that toggle them live outside the
// filter-strip; they're consulted directly in applyFilters / adPassesFilter.

import { state } from "./state.js";
import {
  fieldTags, listingStatus, primaryField, FIELD_ORDER,
  getStructuredPosition,
} from "./classify.js";
import {
  daysUntil,
  isAsstProfMatch, isAssocProfMatch, isFullProfMatch,
  isResearchMatch, isVisitingMatch,
} from "./card-helpers.js";
import { matchesSearch } from "./search.js";

/** Tiny DOM helper: collect the values of all checked inputs inside #id. */
export function getChecked(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map(el => el.value);
}

export function currentFilterState() {
  return {
    query: document.getElementById("search").value.trim().toLowerCase(),
    fields: new Set(getChecked("filter-hss")),
    statuses: new Set(getChecked("filter-quality")),
    types: new Set(getChecked("filter-type")),
    posGroups: new Set(getChecked("filter-posgroup")),
    states: new Set(getChecked("filter-state")),
    sort: document.getElementById("sort").value,
  };
}

export function filterHaystack(ad, inst = {}) {
  const sp = getStructuredPosition(ad);
  return [
    ad.title, ad.department, ad.discipline, inst.name, inst.short_name,
    ad.raw_text_excerpt, ad.pdf_excerpt, ad.unit_eligibility,
    ad.publications_required, ad.general_eligibility,
    sp?.department, sp?.discipline, sp?.school_or_centre,
    ...(sp?.areas || []), sp?.methods_preference, sp?.approach,
  ].filter(Boolean).join(" ").toLowerCase();
}

export function applyFilters(st) {
  return state.ADS.filter(ad => {
    const inst = state.INSTITUTIONS[ad.institution_id] || {};
    if (st.fields.size && !fieldTags(ad).some(f => st.fields.has(f))) return false;
    if (st.statuses.size && !st.statuses.has(listingStatus(ad))) return false;
    if (st.types.size && !st.types.has(inst.type)) return false;
    if (st.states.size && !st.states.has(inst.state)) return false;
    if (st.posGroups.size) {
      // Inclusive OR across the rank checkboxes: ad passes if it matches
      // any selected rank.
      const tests = {
        faculty:   () => isAsstProfMatch(ad),
        associate: () => isAssocProfMatch(ad),
        full:      () => isFullProfMatch(ad),
        research:  () => isResearchMatch(ad),
        visiting:  () => isVisitingMatch(ad),
      };
      let any = false;
      for (const v of st.posGroups) { if (tests[v] && tests[v]()) { any = true; break; } }
      if (!any) return false;
    }
    if (st.query) {
      if (!matchesSearch(filterHaystack(ad, inst), st.query)) return false;
    }
    // Phase-2 synthetic "closing this week" quick-filter — checks the
    // calendar rather than a checkbox group. Window-scoped so the state
    // survives across renders without bloating the filter object shape.
    if (window._closingSoonOnly) {
      const d = daysUntil(ad.closing_date);
      if (d == null || d < 0 || d > 7) return false;
    }
    // "Reserved posts only" toggle. Passes ads where reservation has been
    // operationalised (per-post counts published) OR is the central
    // affirmative purpose of the call (Special Recruitment Drive).
    // Statutory percentage boilerplate alone does NOT qualify — that's
    // policy citation, not actual reserved-post identification.
    if (window._reservedOnly && !isReservedPost(ad)) return false;
    return true;
  });
}

// Centralised "is this a reserved-post ad" check. Used by the chip filter
// AND the per-card render code, so the logic stays consistent.
export function isReservedPost(ad) {
  const sp = getStructuredPosition(ad);
  const cat = sp?.reservation_breakdown || ad.category_breakdown || {};
  const hasCounts = ["UR","SC","ST","OBC","EWS","PwBD"].some(k => cat[k] != null && cat[k] > 0);
  if (hasCounts) {
    // True only if at least one RESERVED category has > 0 (UR-only doesn't count).
    return ["SC","ST","OBC","EWS","PwBD"].some(k => cat[k] != null && cat[k] > 0);
  }
  const txt = `${ad.title || ""} ${sp?.raw_section_text || ""} ${ad.pdf_excerpt || ""} ${ad.raw_text_excerpt || ""} ${ad.reservation_note || ""}`;
  return Boolean(sp?.is_special_recruitment_drive) || /\b(special\s+recruitment\s+drive|mission\s+mode\s+recruitment|SRD\b|recruitment\s+drive\s+for\s+(SC|ST|OBC|EWS|PwBD|PwD|reserved))/i.test(txt);
}

export function applySort(ads, sort) {
  const deadlineRank = (ad) => {
    const d = daysUntil(ad.closing_date);
    if (d == null) return 9999;
    return d < 0 ? 9998 : d;
  };
  const fieldRank = (ad) => {
    const field = primaryField(ad);
    const n = FIELD_ORDER.indexOf(field);
    return n === -1 ? FIELD_ORDER.length : n;
  };
  const byDeadline = (a, b) => deadlineRank(a) - deadlineRank(b);
  const byInstitution = (a, b) => (state.INSTITUTIONS[a.institution_id]?.name || "").localeCompare(state.INSTITUTIONS[b.institution_id]?.name || "");
  const byField = (a, b) => fieldRank(a) - fieldRank(b) || primaryField(a).localeCompare(primaryField(b));
  const cmp = {
    closing: (a, b) => byDeadline(a, b) || byField(a, b) || byInstitution(a, b),
    newest: (a, b) => (b.publication_date || "").localeCompare(a.publication_date || "") || byDeadline(a, b) || byField(a, b),
    field: (a, b) => byField(a, b) || byDeadline(a, b) || byInstitution(a, b),
    inst: (a, b) => byInstitution(a, b) || byField(a, b) || byDeadline(a, b),
  };
  return [...ads].sort(cmp[sort] || cmp.closing);
}

// ---------- reactive facet counts ----------
// For each filter dimension, count ads that match all OTHER active filters. This
// is the standard faceted-search pattern: toggling one dimension never makes its
// own options disappear, but narrows what the others can show.
export function adPassesFilter(ad, st, skipDim) {
  const inst = state.INSTITUTIONS[ad.institution_id] || {};
  if (skipDim !== "hss" && st.fields.size && !fieldTags(ad).some(f => st.fields.has(f))) return false;
  if (skipDim !== "quality" && st.statuses.size && !st.statuses.has(listingStatus(ad))) return false;
  if (skipDim !== "type" && st.types.size && !st.types.has(inst.type)) return false;
  if (skipDim !== "state" && st.states.size && !st.states.has(inst.state)) return false;
  if (skipDim !== "posgroup" && st.posGroups.size) {
    const tests = {
      faculty:   () => isAsstProfMatch(ad),
      associate: () => isAssocProfMatch(ad),
      full:      () => isFullProfMatch(ad),
      research:  () => isResearchMatch(ad),
      visiting:  () => isVisitingMatch(ad),
    };
    let any = false;
    for (const v of st.posGroups) { if (tests[v] && tests[v]()) { any = true; break; } }
    if (!any) return false;
  }
  if (st.query) {
    if (!matchesSearch(filterHaystack(ad, inst), st.query)) return false;
  }
  if (window._reservedOnly && !isReservedPost(ad)) return false;
  return true;
}

export function updateReactiveCounts(st) {
  const counts = {
    hss: {},
    quality: { hss: 0, "non-hss": 0, other: 0 },
    type: {},
    state: {},
    posgroup: { faculty: 0, associate: 0, full: 0, research: 0, visiting: 0 },
  };
  for (const ad of state.ADS) {
    const inst = state.INSTITUTIONS[ad.institution_id] || {};
    if (adPassesFilter(ad, st, "hss")) {
      for (const field of fieldTags(ad)) counts.hss[field] = (counts.hss[field] || 0) + 1;
    }
    if (adPassesFilter(ad, st, "quality")) counts.quality[listingStatus(ad)]++;
    if (adPassesFilter(ad, st, "type") && inst.type) counts.type[inst.type] = (counts.type[inst.type] || 0) + 1;
    if (adPassesFilter(ad, st, "state") && inst.state) counts.state[inst.state] = (counts.state[inst.state] || 0) + 1;
    if (adPassesFilter(ad, st, "posgroup")) {
      if (isAsstProfMatch(ad))  counts.posgroup.faculty++;
      if (isAssocProfMatch(ad)) counts.posgroup.associate++;
      if (isFullProfMatch(ad))  counts.posgroup.full++;
      if (isResearchMatch(ad))  counts.posgroup.research++;
      if (isVisitingMatch(ad))  counts.posgroup.visiting++;
    }
  }
  // Update the .cnt spans already rendered by populateFilters, and dim options
  // with zero matches (they're not useful selections from the current cross-section).
  const paint = (containerId, byValue) => {
    document.querySelectorAll(`#${containerId} label`).forEach(lbl => {
      const input = lbl.querySelector("input");
      const cnt = lbl.querySelector(".cnt");
      const v = input.value;
      const n = byValue[v] ?? 0;
      if (cnt) cnt.textContent = n;
      lbl.style.opacity = (n === 0 && !input.checked) ? 0.4 : "";
      lbl.hidden = false;
    });
  };
  paint("filter-hss", counts.hss);
  paint("filter-quality", counts.quality);
  paint("filter-type", counts.type);
  paint("filter-state", counts.state);
  paint("filter-posgroup", counts.posgroup);
}
