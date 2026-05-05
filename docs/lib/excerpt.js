// docs/lib/excerpt.js — sanitiseExcerpt + helper regexes.
//
// The excerpt sanitiser is the crash barrier between scraped page-chrome
// junk (nav breadcrumbs, social widgets, calendar pickers, multi-school
// dumps) and the candidate-facing card. Each branch handles a known
// scrape pathology — the comments document which institution surfaced
// the pattern.

/** Phrases that indicate the excerpt has substantive recruitment content. */
export const SUBSTANTIVE_MARKERS = /\b(vacant\s+positions?|the\s+vacant\s+position|sanctioned\s+(strength|posts?)|areas?\s+of\s+(specialization|specialisation|recruitment)|eligibilit(y|ies)|qualifications?\s+(and|&)\s+experience|qualifications?\s+required|applications?\s+are\s+invited|invites?\s+applications?|the\s+following\s+(?:areas?|positions?|departments?)|number\s+of\s+(?:posts?|positions?|vacancies?)|specialization|department[\s-]+wise|broad\s+areas?)\b/i;

/** Phrases that indicate the excerpt is institutional marketing prose
 *  (FLAME's "pioneer of liberal education" prologue is the canonical case). */
export const INSTITUTIONAL_BOILERPLATE = /\b(?:pioneer\s+of\s+liberal\s+education|recognized\s+strengths\s+in\s+the\s+areas?|recognised\s+strengths\s+in\s+the\s+areas?|offers\s+undergraduate\s+programs?|offers\s+undergraduate\s+programmes?|provides\s+an\s+environment\s+for\s+faculty\s+to\s+conduct|overall,\s+the\s+school\s+stands\s+for)\b/i;

/** Devanagari range — used to strip Hindi address blocks from English-first
 *  cards. Source PDFs remain bilingual; cards are English. */
export const DEVANAGARI_RE = /[ऀ-ॿ]/;

/**
 * Sanitise a raw scraped excerpt. Output is either:
 *   - A clean substantive prose snippet ready for the Description block, or
 *   - "" if the excerpt is junk and should be suppressed.
 *
 * Branches in order:
 *   - Calendar-widget collapse (Azim Premji)
 *   - Devanagari-line stripping (multi-language mastheads)
 *   - APU template ("Faculty Positions in X / We invite ...")
 *   - Trailing Deadline / Campus stripping
 *   - Institutional-boilerplate suppression (FLAME, Krea)
 *   - Halves-duplication detection (career-page title-repeats)
 *   - Listing-row JSON detection (Shiv Nadar)
 *   - Short-no-marker rejection (nav chrome remainders)
 *   - Substantive-marker masthead-skip (IIM Bodh Gaya prefix)
 */
export function sanitizeExcerpt(text) {
  if (!text) return "";
  let out = text
    // Azim Premji "Deadline Add to Calendar × Add to Calendar iCal Google
    // Outlook Outlook.com Yahoo <real-deadline-date>" — collapse the whole
    // calendar widget block back to just "Deadline:".
    .replace(/Deadline\s+Add to Calendar(?:\s*×\s*Add to Calendar)?\s+iCal\s+Google\s+Outlook\s+Outlook\.com\s+Yahoo\s+/gi, "Deadline: ")
    // Generic stray "Add to Calendar" / "× Add to Calendar" leftovers.
    .replace(/(?:×\s*)?Add to Calendar\s+/gi, "")
    // Provider-name run that sometimes survives separately
    // ("iCal Google Outlook Outlook.com Yahoo").
    .replace(/\biCal\s+Google\s+Outlook\s+Outlook\.com\s+Yahoo\s*/gi, "")
    // Drop Devanagari-script address/header lines. We want English copy
    // on the card; the source PDF is one click away if the reader wants
    // the bilingual original.
    .replace(/[^\n.|]*[ऀ-ॿ]+[^\n.|]*/g, "")
    // Normalise leftover whitespace.
    .replace(/\s{2,}/g, " ")
    .trim();

  // Azim Premji-style template: "Faculty Positions in X We invite
  // applications for faculty positions in X[, specializing in Y] for our
  // <Programme> Programmes. Deadline: <date> Campus <city>"
  // The title already shows "Faculty Positions in X"; the deadline is in
  // the deadline pill; the campus is in the institution headline. So
  // collapse the whole template down to the substantive bit (the
  // specialisation, if any, and the programme level).
  const apu = out.match(/^Faculty Position[s]?\s+in\s+[^.]+?\s+We\s+invite\s+applications\s+for\s+faculty\s+position[s]?\s+in\s+([^.]+?)\s+for\s+our\s+([^.]+?)(?=\.|$)/i);
  if (apu) {
    const fieldPart = apu[1].trim();
    const programme = apu[2].trim();
    const specMatch = fieldPart.match(/,\s*(specializing\s+in\s+.+|with\s+specialization\s+.+|focusing\s+on\s+.+)$/i);
    const spec = specMatch ? specMatch[1].trim() : "";
    const tail = out.slice(out.indexOf(programme) + programme.length); // anything after "Programmes" (e.g. ". Deadline... Campus X")
    out = (spec ? `${spec.charAt(0).toUpperCase()}${spec.slice(1)}; for our ${programme}.` : `For our ${programme}.`) + tail;
  }
  // Strip trailing "Deadline:?<anything until end-or-Campus>" — already
  // shown as the deadline pill on the card.
  out = out.replace(/[\s.]*Deadline\s*:?\s*[^.]*?(?=\s+Campus\s+[A-Z]|\.|$)/gi, "");
  // Strip trailing "Campus <Word>" — already shown in the institution head.
  out = out.replace(/[\s.]+Campus\s+[A-Z][a-zA-Z]+\s*\.?\s*$/i, "");
  out = out.replace(/\s{2,}/g, " ").trim();

  // Repeated school/institution marketing copy is not job-specific
  // evidence. It can help infer the recruiting unit elsewhere, but it
  // should not appear as Description or feed Topical fit chips.
  if (INSTITUTIONAL_BOILERPLATE.test(out) && !/\b(?:qualifications?|eligibilit|responsibilit|apply\s+by|deadline|last\s+date)\b/i.test(out)) {
    return "";
  }

  // (1) Suppress nav-crumb duplications. Many career pages render the
  // section title twice ("Faculty Recruitment Faculty Recruitment",
  // "English English", "Recruitment Announcements Recruitment Announcements")
  // — the scrape concatenates the breadcrumb and heading. If the excerpt
  // is two equal halves repeating, return empty.
  const halves = out.match(/^(.{1,60}?)\s+\1\s*$/);
  if (halves) return "";

  // (2) Suppress dynamic-listing JSON-fragment artifacts: "3675 | Assistant
  // Professor - X | Jun 30, 2026 | Apply" patterns (Shiv Nadar, FLAME, etc.).
  // Two or more pipes plus a "Apply"/"Apply Now" tail = listing-row scrape,
  // not paragraph prose. The card already shows the title and apply link.
  if (/\|.*\|.*\b(Apply(\s*Now)?|Read\s+More)\s*$/i.test(out)) return "";
  if (out.split(/\s*\|\s*/).length >= 3 && out.length < 200) return "";

  // (3) Below 60 chars and no substantive marker = page-chrome remainder.
  // Stub messages from rolling-call placeholders are typically much longer
  // (>120 chars) and include phrases like "Most IIMs route applications"
  // — those survive this filter naturally.
  if (out.length < 60 && !SUBSTANTIVE_MARKERS.test(out)) return "";

  // (4) IIM Bodh Gaya pattern: institutional masthead boilerplate prefix
  // followed by substantive recruitment content. If a marker appears far
  // enough in, jump past the masthead. Boundary at sentence-start.
  const m = SUBSTANTIVE_MARKERS.exec(out);
  if (m && m.index > 80 && m.index < out.length - 50) {
    const back = out.slice(Math.max(0, m.index - 120), m.index);
    const lastBreak = Math.max(back.lastIndexOf(". "), back.lastIndexOf("\n"));
    const start = lastBreak >= 0 ? (m.index - back.length + lastBreak + 1) : m.index;
    out = out.slice(start).trim();
  }
  return out;
}
