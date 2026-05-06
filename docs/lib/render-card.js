// docs/lib/render-card.js — renderAd() + supporting render-time logic.
//
// renderAd is the most user-facing function: it builds each listing card's
// HTML from an ad record. It pulls every cue/discipline/rank/format helper
// from lib/card-helpers.js, the data sanitisers from lib/sanitize.js +
// lib/excerpt.js, the classifier results from lib/classify.js, and the
// shared mutable state from lib/state.js. wireAdActions attaches the
// star/save click handlers after the cards land in the DOM.
//
// HIRING_TRAPS + extractTraps are colocated because they're only consumed
// by renderAd's traps row.

import { state, persistSaved } from "./state.js";
import { escapeHTML, escapeAttr, safeUrl, resolveUrl } from "./sanitize.js";
import { sanitizeExcerpt } from "./excerpt.js";
import {
  classifyAd, fieldTags, getStructuredPosition, listingStatus,
  QUALITY_LABELS,
} from "./classify.js";
import {
  TYPE_COLORS,
  detectAdCampus, cityAlreadyInInstitutionName,
  daysUntil, urgencyTier, formatDate, formatCountdown, daysSince,
  sourceLabel, sourceLinkLabel,
  cardDiscipline, cardRankLine,
  extractCardCues, structuredCues,
  isThirdPartyApplyHost,
} from "./card-helpers.js";

// Hiring-language traps — phrases in faculty advertisements that quietly
// exclude candidates from non-elite educational backgrounds. Each entry
// pairs a regex with a one-line plain-English explanation of who it
// disadvantages and why. Surface these in the ad render so a candidate
// reading the listing sees the structural exclusion explicitly, not as
// hidden bureaucratic language.
//
// Source for the patterns: actual phrasing observed in the cached IIT
// Madras / IIT Delhi / IIIT-Delhi / IIT Bombay PDFs. Add to this list as
// new patterns appear in subsequent scrapes — the more eyes on the corpus,
// the better the catalogue.
export const HIRING_TRAPS = [
  {
    re: /\bfirst[\s-]+class\b[^.]{0,80}\b(throughout|in\s+all\s+(preceding|previous)\s+degrees?|including\s+higher[\s-]+secondary|preceding\s+degrees?\s+and\s+certificates)/i,
    label: "First-class-throughout requirement",
    why: "Excludes candidates without first-class marks at every prior level (sometimes including 10th/12th board). Many candidates from state-board schools or non-elite undergraduate institutions don't qualify on paper. Some institutions allow appeals or relaxations — check the application portal or write to the dean.",
  },
  {
    re: /\b(Ph\.?D\.?|doctorate)\s+from\s+(top|reputed|premier|leading|world[-\s]?class)\s+(institut|universit)/i,
    label: "PhD-from-top-institution preference",
    why: "Pedigree filter. Often functions as caste-correlated exclusion through the global ranking system (US/UK/IIT/IISc PhDs over Indian state-university PhDs). Apply anyway if your work is strong; selection committees vary.",
  },
  {
    re: /\bminimum\s+\w+\s*\(?\d+\)?\s+publications?\b[^.]{0,60}\b(Scopus|SCI[-\s]?indexed|Web\s+of\s+Science|first\s+author)/i,
    label: "High publication threshold + indexing requirement",
    why: "Hard publication minima with index restrictions disadvantage candidates from underfunded labs or fields where Scopus/SCI coverage is weak. If your publication count is borderline, surface book chapters / edited volumes / public-facing work in your CV cover.",
  },
  {
    re: /\b(consistently|good)\s+academic\s+record\b/i,
    label: "Vague 'consistently good academic record' clause",
    why: "Discretionary exclusion mechanism — interpretable by the selection committee to mean whatever they want. Pair with strong references that affirm your trajectory; CV gaps deserve a one-line cover-letter explanation.",
  },
  {
    re: /\b(post[-\s]?doc(toral)?|teaching)\s+experience\b[^.]{0,60}\b(required|essential|mandatory|must)/i,
    label: "Postdoc/teaching experience hard requirement",
    why: "Filters out new PhDs and candidates from institutions that don't fund postdocs. If you have research-grant-funded work, project-fellow stints, or guest-lecture experience, list these as equivalent — many institutes treat them as such even when not explicitly invited.",
  },
  {
    re: /\b(no\s+objection\s+certificate|NOC)\b/i,
    label: "NOC from current employer required",
    why: "If you are currently employed, your current institution must release a 'No Objection Certificate' before your application can be processed. Some institutions delay or refuse NOCs strategically. Submit your application with the advance copy and chase the NOC in parallel — most institutes accept this workflow.",
  },
];

export function extractTraps(ad) {
  const text = `${ad.title || ""} ${ad.unit_eligibility || ""} ${ad.general_eligibility || ""} ${ad.publications_required || ""} ${ad.raw_text_excerpt || ""}`;
  const out = [];
  for (const t of HIRING_TRAPS) {
    if (t.re.test(text)) out.push({ label: t.label, why: t.why });
  }
  return out;
}

export function renderAd(ad) {
  const inst = state.INSTITUTIONS[ad.institution_id] || { name: ad.institution_id };
  const instType = String(inst.type || "");
  const isPrivateInstitution = instType.toLowerCase().includes("private");
  const institutionScope = isPrivateInstitution ? "private" : "public";
  const cls = classifyAd(ad);
  const tier = urgencyTier(ad);
  const structuredPosForRender = getStructuredPosition(ad);
  const cat = structuredPosForRender?.reservation_breakdown || ad.category_breakdown || {};
  const effectivePostCount = structuredPosForRender?.number_of_posts ?? ad.number_of_posts;
  const catBits = ["UR","SC","ST","OBC","EWS","PwBD"].filter(k => cat[k] != null && cat[k] > 0).map(k => [k, cat[k]]);
  const roster = catBits.length
    ? `<div class="roster">Roster: ${catBits.map(([k,v],i) => `${i?'<span class="sep">·</span>':""}<span class="k">${k}</span>:${v}`).join("")}</div>`
    : "";
  const typeColor = TYPE_COLORS[inst.type] || "var(--muted)";
  const fields = fieldTags(ad).filter(f => f !== "Other");
  const hssFlag = fields.slice(0, 2).map(f => `<span class="hss-flag">${escapeHTML(f)}</span>`).join("");
  const status = listingStatus(ad);

  // Chips: post type + contract + posts + low-confidence flag
  const chips = [];
  if (status !== "ready") chips.push(`<span class="chip lowconf">${escapeHTML(QUALITY_LABELS[status])}</span>`);
  if (ad.post_type && ad.post_type !== "Unknown") {
    const label = ad.post_type === "Research" || ad.post_type === "Scientific" ? "Research/Postdoc"
                : ad.post_type === "NonFaculty" ? "Non-Faculty" : ad.post_type;
    chips.push(`<span class="chip">${label}</span>`);
  }
  if (ad.contract_status && ad.contract_status !== "Unknown") {
    const cs = ad.contract_status === "TenureTrack" ? "Tenure-Track" : ad.contract_status;
    chips.push(`<span class="chip muted">${escapeHTML(cs)}</span>`);
  }
  if (effectivePostCount) chips.push(`<span class="chip muted">${effectivePostCount} ${effectivePostCount===1?"post":"posts"}</span>`);
  if (typeof ad.parse_confidence === "number" && ad.parse_confidence < 0.45) chips.push(`<span class="chip lowconf">rough parse</span>`);
  chips.push(`<span class="chip muted">${escapeHTML(sourceLabel(ad))}</span>`);
  const seenDays = daysSince(ad.snapshot_fetched_at);
  if (seenDays != null) {
    chips.push(`<span class="chip muted">checked ${seenDays === 0 ? "today" : seenDays + "d ago"}</span>`);
    if (seenDays >= 14) chips.push(`<span class="chip lowconf">stale source</span>`);
  }

  const saved = state.SAVED.has(ad.id);

  // Title with optional sub-area appended (e.g. "Sociology" inside HSS unit).
  // The title already contains "Faculty — <Dept>" or "Faculty — <Dept> — <Sub>";
  // we render it as-is but split off the trailing sub-area in muted style.
  const title = ad.title || "(untitled)";
  const titleHTML = (() => {
    const parts = title.split(/\s+—\s+/);
    if (parts.length >= 3) {
      // "Faculty — Dept — SubArea"
      const [head, dept, ...rest] = parts;
      return `${escapeHTML(head + " — " + dept)} <span class="field-spec">— ${escapeHTML(rest.join(" — "))}</span>`;
    }
    return escapeHTML(title);
  })();

  // Meta-line: dept (only if not already in title), discipline (only if differs from dept),
  // posted-date. This is the fix for the redundant DEPT/FIELD problem.
  const metaParts = [];
  const inTitle = (s) => s && title.toLowerCase().includes(s.toLowerCase());
  if (ad.department && !inTitle(ad.department)) {
    metaParts.push(`<span class="dept">${escapeHTML(ad.department)}</span>`);
  }
  if (ad.discipline && ad.discipline !== ad.department && !inTitle(ad.discipline)) {
    metaParts.push(`<span class="dept">${escapeHTML(ad.discipline)}</span>`);
  }
  if (ad.publication_date) {
    metaParts.push(`<span class="posted">posted ${escapeHTML(formatDate(ad.publication_date))}</span>`);
  }
  const metaLine = (metaParts.length || chips.length)
    ? `<div class="meta-line">${chips.join("")}${chips.length && metaParts.length ? '<span class="dot">·</span>' : ''}${metaParts.join('<span class="dot">·</span>')}</div>`
    : "";

  // Deadline pill
  const deadlinePill = ad.closing_date
    ? `<span class="deadline-pill">${escapeHTML(formatCountdown(ad))} <span class="dl-date">· ${escapeHTML(formatDate(ad.closing_date))}</span></span>`
    : `<span class="deadline-pill no-dl">rolling, no deadline</span>`;

  // Action links — apply portal is the primary CTA, all other source
  // links are secondary. The candidate's first decision is "click to
  // apply"; "look at the original PDF / listing page" is a verification
  // step, useful but quieter.
  const sourceLinks = [];
  sourceLinks.push(`<a href="${escapeAttr(resolveUrl(ad.original_url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(sourceLinkLabel(ad))}</a>`);
  if (ad.annexure_pdf_url) {
    sourceLinks.push(`<a href="${escapeAttr(safeUrl(ad.annexure_pdf_url))}" target="_blank" rel="noopener noreferrer">Annexure ↗</a>`);
  }
  if (ad.info_url && ad.info_url !== ad.original_url) {
    sourceLinks.push(`<a href="${escapeAttr(safeUrl(ad.info_url))}" target="_blank" rel="noopener noreferrer">Listing page ↗</a>`);
  }
  // Fall back to the institution-level apply URL when the ad doesn't
  // carry one. Some ad PDFs (IIT Indore, etc.) just point at the PDF and
  // expect the candidate to find the institute's faculty-recruitment
  // portal separately; the registry holds that portal URL.
  const applyUrl = ad.apply_url || inst.apply_url;

  // Areas excerpt (quiet body; no accent border, no "AREAS / NOTES" label).
  // Sanitised because some institution pages embed UI widgets that bleed
  // through the HTML→text strip (e.g. Azim Premji's "Add to Calendar"
  // dropdown, which appends "iCal Google Outlook Outlook.com Yahoo" to
  // every listing). The cleanup is conservative — only known patterns.
  // PDF excerpt (when available) vs HTML scrape (default). For most
  // institutions, the HTML career page captures only marketing copy
  // ("We invite applications…"); the actual hiring criteria — sub-areas,
  // methods, qualifications, evaluation — sit in the notification PDF
  // the ad links to. The local enrichment script
  // (scripts/enrich_current_with_pdf.py) extracts substantive chunks
  // from those PDFs and writes them as ad.pdf_excerpt; we prefer it
  // when present, falling back to ad.raw_text_excerpt.
  const structuredPos = getStructuredPosition(ad);
  const cleanedExcerpt = sanitizeExcerpt(structuredPos?.raw_section_text || ad.pdf_excerpt || ad.raw_text_excerpt || "");
  // The cover-letter scan: a candidate reads this section to decide
  // three things — (1) do my projects fit the sub-areas they're hiring
  // in, (2) do I clear the stated eligibility screen, (3) how will the
  // committee evaluate my file. We extract and label these explicitly.
  // When the recruiting department has not specified one of
  // them, we say so — the absence is named, not hidden. Across many
  // cards this surfaces a pattern: most departments do not enunciate
  // their requirements clearly, leaving candidates to guess. That
  // pattern IS the political point of this view; it should be visible.
  const extractedCues = extractCardCues(cleanedExcerpt, ad);
  const sCues = structuredCues(ad);
  const cues = {
    areas: sCues.areas || extractedCues.areas,
    methods: sCues.methods || extractedCues.methods,
    approach: sCues.approach || extractedCues.approach,
    eligibility: sCues.eligibility || extractedCues.eligibility,
    evaluation: sCues.evaluation || extractedCues.evaluation,
  };
  const NS_TIP = "The source ad did not disclose this clearly enough to extract.";
  const empty = `<span class="card-cue-empty" title="${NS_TIP}">Not disclosed in source ad</span>`;
  // Topical-fit chips should be scannable in 1-2 seconds. Source extractions
  // sometimes pack many sub-topics into one string. Strategy:
  //   1. Strip any parenthetical (the headline before "(" is what's
  //      scannable; the parenthetical examples don't fit in a chip).
  //   2. Strip any em/en-dash explanation tail.
  //   3. Split remainder on semicolons, then capitalised commas, then
  //      "and" between Capital tokens.
  //   4. Dedupe, cap length, cap count.
  const atomizeAreas = (raws) => {
    if (!Array.isArray(raws)) return [];
    const out = [];
    const seen = new Set();
    // Greedy-strip ALL parenthetical pairs (handles nested paren by simple
    // depth count) — leaves headlines like "Quantitative Macroeconomics"
    // instead of "Quantitative Macroeconomics (microfounded ... models; ...)".
    const stripParens = (s) => {
      let out = "";
      let depth = 0;
      for (const ch of s) {
        if (ch === "(") depth++;
        else if (ch === ")") { if (depth > 0) depth--; }
        else if (depth === 0) out += ch;
      }
      return out.replace(/\s{2,}/g, " ").replace(/\s+([,;.])/g, "$1").trim();
    };
    for (const raw of raws) {
      const s = String(raw || "").trim();
      if (!s) continue;
      const noParens = stripParens(s);
      const headline = noParens.split(/\s*[—–]\s+/)[0];
      const parts = headline
        .split(/\s*;\s*|\s*,\s*(?=[A-Z])|\s+and\s+(?=[A-Z])/)
        .flatMap(p => p.split(/\s*,\s*(?=[A-Z])/))
        .map(p => p.trim())
        .filter(p => p && p.length > 1);
      for (const p of parts) {
        let chip = p.replace(/^(?:and|with|including|such as|e\.g\.,?)\s+/i, "")
                    .replace(/[\s,;.]+$/, "")
                    .trim();
        if (chip.length > 60) chip = chip.slice(0, 56).replace(/[\s,;.]+$/, "") + "…";
        const k = chip.toLowerCase();
        if (k && !seen.has(k)) { seen.add(k); out.push(chip); }
      }
    }
    return out.slice(0, 12);
  };
  // Topical-fit row: when the source ad disclosed area chips, render them
  // inline as quiet labels. When it didn't, drop the entire row — the
  // "Not disclosed in source ad" label was repetitive noise across most
  // cards and didn't help the candidate decide. The collapsed-details
  // disclosure further down still surfaces the source's full topical fit
  // when one exists.
  const atomicAreas = atomizeAreas(cues.areas);
  const visibleAreas = atomicAreas.slice(0, 4);
  const hiddenAreas = atomicAreas.slice(visibleAreas.length);
  const hiddenAreaCount = Math.max(0, atomicAreas.length - visibleAreas.length);
  const areasHTML = atomicAreas.length
    ? `<div class="card-cues">
         <div class="card-cue card-cue-areas">
           <span class="card-cue-tags">
             ${visibleAreas.map(a => `<span class="card-area-chip">${escapeHTML(a)}</span>`).join("")}
             ${hiddenAreaCount ? `<details class="card-area-more-wrap"><summary class="card-area-more">+${hiddenAreaCount} more</summary><span class="card-area-more-list">${hiddenAreas.map(a => `<span class="card-area-chip">${escapeHTML(a)}</span>`).join("")}</span></details>` : ""}
           </span>
         </div>
       </div>`
    : "";

  // Collapsible details — short label, button-ish
  const hasDetails = ad.unit_eligibility || ad.publications_required || ad.general_eligibility || ad.reservation_note || ad.process_note || ad.contact || ad._source_note;
  const detailsHTML = hasDetails ? `
    <details class="details">
      <summary>Eligibility &amp; how to apply ▾</summary>
      ${ad._source_note ? `<div class="detail-block"><span class="k">Source note</span><div class="v">${escapeHTML(ad._source_note)}</div></div>` : ""}
      ${cues.areas && cues.areas.length > 3 ? `<div class="detail-block"><span class="k">Full topical fit</span><div class="v">${escapeHTML(cues.areas.join("; "))}</div></div>` : ""}
      ${ad.unit_eligibility ? `<div class="detail-block"><span class="k">Unit eligibility</span><div class="v">${escapeHTML(ad.unit_eligibility)}</div></div>` : ""}
      ${ad.publications_required ? `<div class="detail-block"><span class="k">Publication requirements</span><div class="v">${escapeHTML(ad.publications_required)}</div></div>` : ""}
      ${ad.general_eligibility ? `<div class="detail-block"><span class="k">General eligibility</span><div class="v">${escapeHTML(ad.general_eligibility)}</div></div>` : ""}
      ${ad.reservation_note ? `<div class="detail-block"><span class="k">Reservation</span><div class="v">${escapeHTML(ad.reservation_note)}</div></div>` : ""}
      ${ad.process_note ? `<div class="detail-block"><span class="k">Process</span><div class="v">${escapeHTML(ad.process_note)}</div></div>` : ""}
      ${ad.contact ? `<div class="detail-block"><span class="k">Contact</span><div class="v">${escapeHTML(ad.contact)}</div></div>` : ""}
    </details>` : "";

  // ---- Card layout (institution-first) --------------------------------
  // Two-line headline scanned in <2 seconds:
  //   1. INSTITUTION · CITY   (primary scan target — the candidate's
  //      identity-of-employer, and the geographic constraint)
  //   2. DISCIPLINE · RANK · CONTRACT
  //
  // Institution wins primacy because the filter strip already covers
  // discipline / position / contract / location-state — so within any
  // pre-filtered list, the institution name is the only thing left
  // that differentiates one card from another. (We don't currently have
  // a precise institution-name filter; until we do, the card itself has
  // to make the institution scannable.) The discipline + rank + contract
  // remain visible as a subhead so an unfiltered scroll is still useful.

  const instName = inst.short_name || inst.name || "(institution unknown)";
  // City as a parenthetical disambiguator — essential for multi-campus
  // institutions, but redundant when the institution label already names
  // the city/campus ("IIT Delhi", "IIM Bangalore").
  // Per-listing campus override: a multi-campus institution's registry
  // entry has only one city (usually the main campus); when the ad text
  // names a different campus, that wins for display purposes — the
  // candidate would relocate to where the JOB is, not where the
  // headquarters is.
  const adCampus = detectAdCampus(ad);
  const cityForDisplay = adCampus || inst.city;
  const cityInName = cityAlreadyInInstitutionName(instName, cityForDisplay);
  const cityPart = cityForDisplay && !cityInName ? ` <span class="card-campus">(${escapeHTML(cityForDisplay)})</span>` : "";
  
  let rawDiscipline = cardDiscipline(ad);
  let parts = rawDiscipline.split(" — ");
  let discipline;
  if (parts.length === 2) {
    discipline = `${parts[1].trim()} - ${parts[0].replace(/^Department of\s+/i, "").trim()}`;
  } else {
    discipline = rawDiscipline.replace(/^Department of\s+/i, "");
  }

  const rankLineFull = cardRankLine(ad);
  const rankParts = rankLineFull.split(" · ");
  let rankLine = rankParts[0].replace(/Professor/g, "Prof.");
  let contractStr = rankParts.length > 1 ? rankParts[1] : "";
  if (contractStr === "Permanent") contractStr = "";
  // A small flag-row for non-blocking but worth-knowing signals.
  const flags = [];
  flags.push(`<span class="card-flag scope ${institutionScope}">${isPrivateInstitution ? "Private university" : "Public institution"}</span>`);
  if (effectivePostCount) {
    flags.push(`<span class="card-flag">${effectivePostCount} ${effectivePostCount === 1 ? "post" : "posts"}</span>`);
  }
  if (ad.publication_date) {
    flags.push(`<span class="card-flag dim">posted ${escapeHTML(formatDate(ad.publication_date))}</span>`);
  }
  // Deadline column — two-tier display:
  //   0–60 days: big number + "days · 30 May 2026" muted underneath.
  //   61+ days: drop the big number; show only "Closes 30 Nov 2026"
  //     muted and small. The big number stops earning its size at that
  //     range — the candidate just needs the planning anchor (the date),
  //     and quietening these cards lets the urgent ones dominate scan.
  // Closed and rolling are handled separately.
  let deadlineHTML;
  if (ad.closing_date) {
    const d = daysUntil(ad.closing_date);
    if (d == null || d < 0) {
      deadlineHTML = `<div class="deadline-num small">closed</div><div class="deadline-meta">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    } else if (d > 60) {
      deadlineHTML = `<div class="deadline-future">Closes <span class="deadline-future-date">${escapeHTML(formatDate(ad.closing_date))}</span></div>`;
    } else {
      // "days" sits inline next to the number so the unit is anchored to
      // "25" rather than orphaned on the left of the date line below.
      deadlineHTML = `<div class="deadline-num">${d} <span class="deadline-unit-inline">days</span></div><div class="deadline-meta">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    }
  } else {
    // Rolling deadlines need visible weight — they're a candidate's
    // signal that they can apply at any time, not that the post is
    // closed/inactive. Render as a distinct pill rather than as a
    // small muted "rolling" word so it carries the same visual
    // gravity as a numeric countdown.
    deadlineHTML = `<div class="deadline-rolling">⟳ Rolling</div>`;
  }

  // Reservation operates at the cadre/institutional-roster level under the
  // CEI(RTC) Act, 2019. For public institutions we distinguish:
  //   - composite / rolling source ads: shared source URL, explicit multi-post
  //     count, rolling/cadre wording, or multiple units under one call;
  //   - explicitly single-post ads: only when the ad says one/1 post;
  //   - unknown roster point: no post-wise category/roster mapping visible.
  // Private universities are handled separately below because the CEI(RTC)
  // roster-disclosure question does not apply to them.
  const _adText = `${ad.title || ""} ${ad.raw_text_excerpt || ""} ${ad.reservation_note || ""}`;
  const shapeText = `${_adText} ${ad.original_url || ""} ${ad.ad_number || ""} ${ad._source_method || ""}`.toLowerCase();
  const sourcePeerCount = ad.original_url
    ? state.ADS.filter(x => x.original_url === ad.original_url).length
    : 0;
  const isCompositeAd = (() => {
    if (structuredPos?.is_composite_call) return true;
    if (typeof effectivePostCount === "number" && effectivePostCount >= 2) return true;
    if (sourcePeerCount >= 2) return true;
    if (/\b(rolling|rol?lling|all\s+areas?|multiple\s+(areas?|disciplines?)|composite|cadre|various\s+academic\s+units?|department[\s-]?wise|departments?,\s*centres?,\s*(and\s*)?schools?)\b/.test(shapeText)) return true;
    return false;
  })();
  const isExplicitSinglePostAd = (() => {
    if (effectivePostCount === 1) return true;
    if (isCompositeAd) return false;
    return /\b(?:one|1)\s+(?:post|position|vacancy)\b|\bsingle[\s-]+(?:post|position|vacancy)\b/i.test(_adText);
  })();
  // Reservation messaging — four states (plus private-uni handled below):
  //   1. Per-post roster counts published → real coloured pills.
  //   2. Special Recruitment Drive (SRD) for reserved categories →
  //      affirmative-action call out, explain what an SRD is.
  //   3. Composite cadre-level recruitment (multi-post call) without
  //      per-post breakdown → flag the missing roster arithmetic.
  //   4. Single-position / per-area ad → explain that reservation applies
  //      at cadre-roster level, not at the individual-ad level.
  // The statutory percentages (SC-15%, ST-7.5%, OBC-27%, EWS-10%, PwBD-4%)
  // are the constitutional floor every CFTI is bound by; reproducing them
  // on every card is boilerplate noise, not information.
  const isSRD = Boolean(structuredPos?.is_special_recruitment_drive) || /\b(special\s+recruitment\s+drive|mission\s+mode\s+recruitment|SRD\b|recruitment\s+drive\s+for\s+(SC|ST|OBC|EWS|PwBD|PwD|reserved))/i.test(_adText);
  // Private universities are outside the CEI(RTC) faculty-reservation
  // regime. Do not classify their shared jobs pages as "composite
  // recruitment" failures; that roster-disclosure question applies to
  // public/CEI institutions.
  const isPrivate = isPrivateInstitution;
  // Each reservation-state row shows a label + an info icon. The
  // explanation sits behind a click/keyboard disclosure so it works on
  // touch devices too; browser-native title tooltips are too fragile for
  // decision-critical context.
  let art16Color = "grey";
  let art16Tip = "";
  let detailsContent = "";
  let breakdown = "";

  if (isPrivate && !catBits.length) {
    art16Color = "red";
    art16Tip = "Private Universities are not known to implement affirmative action provisions unless compelled to by the state.";
  } else if (catBits.length) {
    art16Color = "green";
    art16Tip = "Institution has published post-wise reservation breakdown.";
    breakdown = catBits.map(([k, v]) => `<span class="reserv-pill r-${escapeAttr(k)}">${escapeHTML(k)}-${v}</span>`).join("");
  } else if (isSRD) {
    art16Color = "green";
    art16Tip = "This ad is part of a Special Recruitment Drive for reserved-category candidates — typically SC/ST/OBC/PwBD posts being filled to reduce roster backlog.";
    breakdown = `<span class="reserv-label good">✓ Special Recruitment Drive</span>`;
  } else if (isCompositeAd) {
    art16Color = "grey";
    art16Tip = "Composite or rolling faculty call. The ad may list many departments/areas under one recruitment PDF, but it does not disclose which roster category each selection point maps to.";
  } else if (isExplicitSinglePostAd) {
    art16Color = "grey";
    art16Tip = "This public-institution ad appears to be for one post/position, but the roster category for that appointment is not disclosed in the advertisement.";
  } else {
    art16Color = "grey";
    art16Tip = "This public-institution ad does not disclose enough post-wise roster information to tell whether the recruitment is single-post or bulk, or which UR/SC/ST/OBC/EWS/PwBD roster point is being used.";
  }

  const art16PillHTML = `
    <details class="reserv-info art16-details">
      <summary class="art16-btn art16-${art16Color} ${art16Color === 'red' ? 'art16-strike' : ''}" aria-label="Explain Article 16 status">
        Article 16 <span aria-hidden="true">▾</span>
      </summary>
      <div class="reserv-info-pop">
        <strong>Article 16 Status:</strong> ${escapeHTML(art16Tip)}
      </div>
    </details>
  `;

  const reservPillsHTML = breakdown ? `
    <div class="row-reserv">
      <div class="reserv-breakdown">${breakdown}</div>
    </div>
  ` : "";
  // Hiring-language traps — surface known exclusion phrases that the ad
  // contains, so candidates can see the structural barriers up front.
  const traps = extractTraps(ad);
  const trapsHTML = traps.length
    ? `<details class="row-traps"><summary><span class="traps-icon">⚑</span> ${traps.length} watch-out${traps.length > 1 ? "s" : ""} in this ad <span class="traps-hint">(click to expand)</span></summary><div class="traps-body">${
        traps.map(t => `<div class="trap"><div class="trap-label">${escapeHTML(t.label)}</div><div class="trap-why">${escapeHTML(t.why)}</div></div>`).join("")
      }</div></details>`
    : "";

  // Always-visible apply/source links. In the classified-row design these
  // remain text actions: the card is a public hiring record first, and an
  // application affordance second.
  // Third-party apply portal disclosure: when the apply URL lives on
  // a different registered domain from the institution itself (e.g.
  // Ashoka → apply.interfolio.com), surface the host so the candidate
  // knows they're being redirected to a third-party application
  // service rather than the institution's own infrastructure. Same-
  // domain links (e.g. iimk.ac.in → recruitment.iimk.ac.in) get no
  // caption — same institution, different subdomain.
  const thirdPartyHost = applyUrl ? isThirdPartyApplyHost(applyUrl, inst) : "";
  const thirdPartyCaption = thirdPartyHost
    ? `<span class="apply-host-via">via ${escapeHTML(thirdPartyHost)}</span>`
    : "";
  const applyButton = applyUrl
    ? `<a class="btn-apply" href="${escapeAttr(safeUrl(applyUrl))}" target="_blank" rel="noopener noreferrer">Apply ↗</a>`
    : "";
  const applyLinksHTML = (applyButton || sourceLinks.length)
    ? `<div class="row-actions-inline">${applyButton}${thirdPartyCaption}${sourceLinks.length ? `<span class="quiet-links">${sourceLinks.join("")}</span>` : ""}</div>`
    : "";

  const detailsBlocks = [];
  // ---- Junk filters for the disclosure body ---------------------------
  // Strip filler phrases that add no signal: "in one of the relevant
  // areas", "in any of the relevant areas", "in relevant area" — they
  // appear when the source advt has no real specialisation discipline
  // and we end up echoing nothing useful.
  const stripFiller = (s) => String(s || "")
    .replace(/(?:^|;|\s)\s*Experience\s+in\s+(?:one\s+of\s+)?(?:any\s+of\s+)?the\s+relevant\s+area[s]?\.?\s*/gi, "$1 ")
    .replace(/(?:^|;|\s)\s*Strong\s+academic\s+and\s+research\s+background\.?\s*/gi, "$1 ")
    .replace(/\s*;\s*\.?\s*$/g, "")
    .replace(/^\s*;\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const eligibilityText = stripFiller(cues.eligibility || cues.methods);
  if (eligibilityText && eligibilityText.length > 4 && !/^PhD required\.?$/i.test(eligibilityText)) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Eligibility</span><div class="v">${escapeHTML(eligibilityText)}</div></div>`);
  }
  const evaluationText = stripFiller(cues.evaluation || cues.approach || "");
  if (evaluationText && evaluationText.length > 4) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Evaluation criteria</span><div class="v">${escapeHTML(evaluationText)}</div></div>`);
  }
  // Description: drop when it's just an echo of institution + discipline
  // (e.g. "IIT Bombay AP — Ashank Desai Centre for Policy Studies. Public
  // Policy." adds no information beyond the headline). When a useful body
  // exists but is preceded by a redundant header sentence (e.g. "Yardi
  // School of Artificial Intelligence (ScAI). All areas of AI ..."), drop
  // just the leading sentence and keep the substantive prose.
  const _norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (cleanedExcerpt) {
    const shellN = _norm(`${instName} ${discipline}`);
    const headTokens = _norm(`${discipline} ${instName}`);
    let descBody = cleanedExcerpt;
    // Strip a short leading sentence that mostly echoes the headline.
    const leadMatch = descBody.match(/^(.{1,100}?)\.\s+(?=[A-Z(])/);
    if (leadMatch && shellN.length > 6) {
      const leadN = _norm(leadMatch[1]);
      // The lead is "redundant" if its alphanumeric content is largely
      // contained in the headline tokens, or vice versa.
      const overlap = leadN && headTokens && (headTokens.includes(leadN) || leadN.length > 6 && leadN.split(/(?=[a-z])/).slice(0,3).join("") && headTokens.includes(leadN.slice(0, Math.min(20, leadN.length))));
      if (overlap) {
        descBody = descBody.slice(leadMatch[0].length).trim();
      }
    }
    const descN = _norm(descBody);
    const isCircular = descBody.length < 220
      && shellN.length > 8
      && (descN === shellN || descN.replace(/^(?:ap|aps|professor|associateprofessor|assistantprofessor)/, "") === shellN || shellN.length > 0 && descN.length - shellN.length < 30 && descN.includes(shellN));
    if (descBody && !isCircular) {
      detailsBlocks.push(`<div class="detail-block"><span class="k">Description</span><div class="v">${escapeHTML(descBody)}</div></div>`);
    }
  }

  // Substantive details live in one disclosure. Topical fit stays visible;
  // everything else is available but not competing with the first scan.
  // Internal extraction-method/confidence is maintainer metadata, not
  // candidate-facing content.
  const publicationDetailsRaw = structuredPos?.qualifications?.publications_required || ad.publications_required || "";
  // Smarter dedup vs. evaluation criteria. Two strings about the same
  // publication requirements often differ by minor phrasing ("8+
  // publications" vs "minimum of 8 publications"); compare on
  // alphanumeric-stripped or numeric-fingerprint instead of raw substring.
  const numericFP = (s) => (String(s || "").match(/\d+/g) || []).slice(0, 6).join(",");
  const publicationAlreadyVisible = publicationDetailsRaw && (
    evaluationText.toLowerCase().includes(String(publicationDetailsRaw).toLowerCase())
    || (_norm(publicationDetailsRaw).length > 30 && _norm(evaluationText).includes(_norm(publicationDetailsRaw)))
    || (numericFP(publicationDetailsRaw).length > 0 && numericFP(publicationDetailsRaw) === numericFP(evaluationText))
  );
  const publicationDetails = publicationAlreadyVisible ? "" : publicationDetailsRaw;
  // Canonical-field rows (Track B of the canonical-fields design).
  // Reads from structured_position.qualifications first; flat fields
  // are surfaced separately via the existing Eligibility / Description
  // blocks built above. Each row only renders when populated, so ads
  // with a sparse structured_position don't grow empty rows.
  const pushBlock = (label, value) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text || text.toLowerCase() === "none" || text === "—") return;
    detailsBlocks.push(`<div class="detail-block"><span class="k">${escapeHTML(label)}</span><div class="v">${escapeHTML(text)}</div></div>`);
  };
  const sq = structuredPos?.qualifications || {};
  // Flat-field fallback: ads without structured_position still expose
  // ad.unit_eligibility via the parser (APU, etc.). Surface that as a
  // Requirements row when the cues-extracted Eligibility block hasn't
  // already shown the same content.
  if (ad.unit_eligibility && !eligibilityText.includes(String(ad.unit_eligibility).slice(0, 60))) {
    pushBlock("Requirements", ad.unit_eligibility);
  }
  pushBlock("PhD requirement", sq.phd);
  pushBlock("Teaching experience required", sq.teaching_experience);
  if (sq.post_phd_experience_years != null && sq.post_phd_experience_years !== "") {
    pushBlock("Post-PhD experience (years)", String(sq.post_phd_experience_years));
  }
  pushBlock("First-class preceding degree", sq.first_class_preceding_degree);
  pushBlock("Methods preference", structuredPos?.methods_preference);
  pushBlock("Other qualifications", sq.other);
  if (publicationDetails) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Publication requirements</span><div class="v">${escapeHTML(publicationDetails)}</div></div>`);
  }
  if (structuredPos?.pay_scale) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Pay scale</span><div class="v">${escapeHTML(structuredPos.pay_scale)}</div></div>`);
  }
  pushBlock("General eligibility", structuredPos?.general_eligibility);
  pushBlock("Specific eligibility", structuredPos?.specific_eligibility);
  if (ad.process_note) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Process</span><div class="v">${escapeHTML(ad.process_note)}</div></div>`);
  }
  if (ad.contact) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Contact</span><div class="v">${escapeHTML(ad.contact)}</div></div>`);
  }
  const detailsHTML2 = detailsBlocks.length
    ? `<details class="details">
        <summary>See details ▾</summary>
        ${detailsBlocks.join("")}
      </details>`
    : "";

  return `
    <article class="listing tier-${tier} scope-${institutionScope}" data-jobid="${escapeAttr(ad.id)}">
      <div class="tier-bar"></div>
      <div class="card-body">
        <div class="card-headline">
          <h3 class="card-institution">${escapeHTML(instName)}${cityPart} ${art16PillHTML}</h3>
          <p class="card-subhead">
            <span class="card-rank">${escapeHTML(rankLine)}, </span>
            <span class="card-discipline">${escapeHTML(discipline)}</span>
            ${contractStr ? `<span class="card-contract-inline"> · ${escapeHTML(contractStr)}</span>` : ""}
          </p>
        </div>
        <div class="card-deadline">${deadlineHTML}</div>
        <div class="card-actions">
          <button type="button" class="star ${saved?'on':''}" title="${saved?'Remove from saved':'Save to watchlist'}" aria-pressed="${saved}" aria-label="${saved?'Remove from saved':'Save to watchlist'}">${saved?'★':'☆'}</button>
        </div>
      </div>
      ${reservPillsHTML}
      ${areasHTML}
      ${trapsHTML}
      ${detailsHTML2}
      ${applyLinksHTML || flags.length ? `
      <div class="card-footer">
        ${applyLinksHTML}
        ${flags.length ? `<div class="card-flags bottom-right">${flags.join('')}</div>` : ""}
      </div>` : ""}
    </article>`;
}

export function wireAdActions(host) {
  host.querySelectorAll(".listing .star").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".listing");
      const id = card.dataset.jobid;
      if (state.SAVED.has(id)) state.SAVED.delete(id); else state.SAVED.add(id);
      persistSaved();
      btn.classList.toggle("on");
      btn.textContent = state.SAVED.has(id) ? "★" : "☆";
      btn.setAttribute("aria-pressed", state.SAVED.has(id));
      document.getElementById("count-saved").textContent = state.SAVED.size > 0 ? state.SAVED.size : "";
    });
  });
}
