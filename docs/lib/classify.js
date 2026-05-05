// docs/lib/classify.js — pure classification logic.
//
// Extracted from app.js so it can be tested without DOM or globals.
// Functions:
//   getStructuredPosition(ad)  → null | structured_position
//   classifyAd(ad)             → "hss" | "ambiguous" | "excluded"
//   fieldTags(ad)              → ["Sociology", ...]
//   primaryField(ad)           → first field tag
//   condenseRanks(ranks[])     → deduped canonical ranks
//   abbreviateRank(r)          → "Asst Prof" / "Assoc Prof" / "Prof"
//   relevanceTag(ad)           → "hss" | "non-hss" | "other"
//   listingStatus(ad)          → alias for relevanceTag (preserved
//                                 for legacy call-sites)
//
// Profile-classifier (HSS / ambiguous / excluded). Three tiers of
// regex match against the ad's identifying fields plus full text:
//   Tier A: HSS match    → humanities/social-science fields, broadly construed
//   Tier B: ambiguous    → faculty/research postings that may contain HSS roles
//   Tier C: out of scope → STEM, admin, finance/commerce, and operational roles
// The dashboard is a public-interest jobs tracker, not a personal-fit filter:
// history, literature, economics, psychology, policy, media, design/HCI, and
// related social-science fields should stay visible unless the core title is
// clearly non-academic/admin or clearly outside HSS.

export const PROFILE_POS_A = [
  /\banthropolog(y|ist|ies|ical)\b/i, /\bethnograph(y|ic|er)\b/i,
  /\bsociolog(y|ical)\b/i, /\bsocial\s+scien(ce|ces)\b/i,
  /\bpolitical\s+scien(ce|ces)\b/i, /\bpolitics\b/i,
  /\beconomics?\b/i, /\bpolitical\s+economy\b/i,
  /\bpublic\s+policy\b/i, /\bpublic\s+administration\b/i,
  /\bgovernance\b/i, /\bdevelopment\s+stud(y|ies)\b/i,
  /\bdevelopment\b/i, /\bgender\s+stud(y|ies)\b/i, /\bgender\b/i,
  /\bhistor(y|ian|ical)\b/i, /\bliterature\b/i,
  /\bphilosoph(y|ical)\b/i, /\blinguistic(s|)\b/i,
  /\b(media|communication|journalism)\s+stud(y|ies)?\b/i, /\bjournalism\b/i,
  /\bpsycholog(y|ical)\b/i,
  /\bscience\s*(and|&|,)\s*technology\s*stud(ies|y)\b/i, /\bSTS\b/,
  /\bscience,?\s*technology,?\s*(and\s*)?society\b/i,
  /\btechnology[-\s]+in[-\s]+society/i, /\bdigital\s+societ/i,
  /\b(critical\s+)?infrastructure\s+stud(y|ies)\b/i,
  /\bcritical\s+data\s+stud(y|ies)\b/i,
  /\b(media|digital|cultural)\s+anthropolog/i,
  /\balgorithmic\s+(governance|culture|stud)/i,
  /\bcaste\s+stud(y|ies)\b/i, /\banti[-\s]?caste\b/i,
  /\bSouth\s+Asia(n)?\s+(studies|anthropolog|society|cultures?)\b/i,
  /\bGlobal\s+Asia\b/i, /\bAsian\s+stud(y|ies)\b/i,
  /\bdigital\s+humanit/i,
  /\b(HCI|CSCW)\b/, /\bhuman[-\s]computer\s+interaction\b/i,
  /\bcomputer[-\s]supported\s+cooperative\s+work\b/i,
  /\bdesign\s+(stud(y|ies)|research)\b/i, /\buser\s+experience\b/i, /\bUX\b/,
  /\bmulti[-\s]?species\s+ethnograph/i,
  /\b(global|postcolonial|decolonial)\s+(data|media|digital|south)\b/i,
  // Indian-institution HSS centres (retained):
  /\bSoPP\b/, /\bADCPS\b/, /\bC[-\s]?TARA\b/,
  /\bSchool\s+of\s+Public\s+Policy/i,
  /\bAshank\s+Desai\s+Centre\s+for\s+Policy/i,
  /\bCentre\s+for\s+Technology\s+Alternatives\s+for\s+Rural/i,
];
export const PROFILE_POS_B = [
  /\bcultural\s+stud(y|ies)\b/i,
  /\bbureaucracy\b/i, /\bgovernmentality\b/i,
  /\binformation\s+stud(y|ies)\b/i, /\bi[-\s]?School\b/i,
  /\bpostcolonial\b/i, /\bglobal\s+south\b/i,
  /\bscience,?\s+technology,?\s+and\s+society/i,
  /\bpublic\s+health\b/i, /\beducation\b/i, /\bpedagog(y|ical)\b/i,
  /\bheritage\s+management\b/i, /\burban\s+stud(y|ies)\b/i,
  /\blaw\b/i, /\blegal\s+stud(y|ies)\b/i,
];
export const PROFILE_NEG = [
  // non-teaching / admin roles
  /\bnon[-\s]?teaching\b/i, /\bregistrar\b/i, /\bclerk\b/i, /\bsecurity\s+officer\b/i,
  // pure STEM / engineering
  /\bengineer(ing|s|)\b/i, /\bchemistry\b/i, /\bmathematics\b/i, /\bphysics\b/i,
  /\bbiology\b/i, /\bbiotech/i, /\bbiochem/i, /\bmicrobiolog/i,
  /\bmechanical\b/i, /\belectrical\b/i, /\belectronics\b/i, /\bcivil\b/i,
  /\bcomputer\s+scien/i, /\bdata\s+scienc/i, /\bartificial\s+intelligence\b/i,
  /\bmachine\s+learn/i, /\brobotics\b/i, /\bnanoscienc/i,
  /\beconometric/i,
  /\bgeograph(y|er|ic)\b/i, /\benvironmental\s+(stud|human|scienc)/i,
  /\bearth\s+scienc/i, /\bsustainability\s+stud/i, /\becology\b/i,
  // finance/management/commerce
  /\bfinance\b/i, /\baccount(ing|ancy|s)\b/i, /\bmarketing\b/i,
  /\boperations\s+management\b/i, /\bsupply\s+chain\b/i,
  /\bbanking\b/i, /\binsurance\b/i, /\bcommerce\b/i,
  // health/bio sciences / clinical roles
  /\bpharmac(y|olog)/i, /\bclinical\s+psycholog/i, /\bneuroscienc/i,
  /\bnursing\b/i, /\bdental\b/i, /\bveterinar/i,
  // music/arts production
  /\bmusic(olog|)\b/i, /\bdance\b/i, /\bperformance\s+art/i,
];
export const FACULTY_HINT = /\bfaculty\b|\bassistant\s+professor\b|\bassociate\s+professor\b|\bprofessor\b|\blecturer\b|\breader\b|\bpostdoc|\bacademic\s+associate\b|\bteaching\s+fellow\b|\bresearch\s+(position|fellow|associate)\b/i;

// Display order for the Discipline filter dropdown. HSS disciplines surface
// first (this dashboard's primary user base is HSS-leaning at present),
// followed by Economics/Finance/Management, then engineering/science/tech,
// then the residual "General / unspecified" and "Other" catch-alls.
export const FIELD_ORDER = [
  // HSS-relevant first (profile-priority).
  "Anthropology", "Sociology", "Political Science", "Public Policy",
  "History", "Philosophy", "Literature", "Linguistics", "Psychology",
  "Cognitive Science", "Education", "Development Studies", "Gender Studies",
  "Media / Communication", "Journalism", "HCI / STS", "Design", "Law",
  "Public Health", "Urban / Geography", "Heritage / Culture",
  // Then the user-deprecated HSS-adjacent (econ / finance / management).
  "Economics", "Finance / Capital Markets", "Management / Business",
  // Engineering / pure-science / tech disciplines — present in the data
  // (every IIT rolling ad covers most of these), filterable individually
  // for users who do want to see them.
  "Computer Science / AI / Data", "Electrical / Electronics",
  "Mechanical / Aerospace", "Civil / Environmental", "Chemical Engineering",
  "Materials / Metallurgical", "Mathematics / Statistics", "Physics",
  "Chemistry", "Biology / Biotech / Biomedical",
  "Earth / Ocean Sciences", "Energy / Sustainability",
  "Industrial / Operations", "Medical / Pharmacy",
  "General / unspecified", "Other",
];
export const HSS_SUBJECT_FILTER_LABELS = new Set([
  "Anthropology", "Sociology", "Political Science", "Public Policy",
  "History", "Philosophy", "Literature", "Linguistics", "Psychology",
  "Cognitive Science", "Education", "Development Studies", "Gender Studies",
  "Media / Communication", "Journalism", "HCI / STS", "Design", "Law",
  "Public Health", "Urban / Geography", "Heritage / Culture",
  "Economics", "Finance / Capital Markets", "Management / Business",
  "General / unspecified",
]);

export const FIELD_RULES = [
  ["Anthropology", [/\banthropolog(y|ical|ist|ies)\b/i, /\bethnograph(y|ic|er)\b/i]],
  ["Sociology", [/\bsociolog(y|ical)\b/i, /\bsocial\s+theor(y|ies)\b/i]],
  ["Economics", [/\beconomics?\b/i, /\bpolitical\s+economy\b/i, /\bdevelopment\s+economics?\b/i]],
  ["Political Science", [/\bpolitical\s+scien(ce|ces)\b/i, /\bpolitics\b/i, /\binternational\s+relations\b/i]],
  ["Public Policy", [/\bpublic\s+policy\b/i, /\bpublic\s+administration\b/i, /\bgovernance\b/i]],
  ["Finance / Capital Markets", [/\bcapital\s+markets?\b/i, /\bfinance\b/i, /\bfinancial\s+(markets?|institutions?|engineering|inclusion|data)\b/i, /\basset\s+pricing\b/i, /\bportfolio\s+management\b/i, /\bfintech\b/i]],
  ["Management / Business", [/\bmanagement\b/i, /\bbusiness\b/i, /\bentrepreneurship\b/i, /\bmarketing\b/i, /\boperations\s+management\b/i, /\bhuman\s+resources?\b/i, /\borganizational\s+behavio(u)?r\b/i]],
  ["History", [/\bhistor(y|ian|ical)\b/i]],
  ["Philosophy", [/\bphilosoph(y|ical)\b/i]],
  ["Literature", [/\bliterature\b/i, /\bliterary\b/i, /\bcomparative\s+lit/i]],
  ["Linguistics", [/\blinguistic(s|)\b/i, /\blanguage\s+stud(y|ies)\b/i]],
  ["Psychology", [/\bpsycholog(y|ical)\b/i]],
  ["Cognitive Science", [/\bcognitive\s+scien/i, /\bcognitive\s+psycholog/i, /\bcognition\b/i]],
  ["Education", [/\beducation\b/i, /\bpedagog(y|ical)\b/i, /\bteaching\s+and\s+learning\b/i]],
  ["Development Studies", [/\bdevelopment\s+stud(y|ies)\b/i, /\bdevelopment\s+(policy|practice|sector|domain|economics?|research)\b/i, /\brural\s+(livelihoods?|development)\b/i]],
  ["Gender Studies", [/\bgender\b/i, /\bwomen'?s\s+stud(y|ies)\b/i]],
  ["Media / Communication", [/\bmedia\s+stud(y|ies)\b/i, /\bcommunication\b/i, /\bfilm\s+(&|and)?\s*television\b/i, /\bdigital\s+media\b/i]],
  ["Journalism", [/\bjournalism\b/i]],
  ["HCI / STS", [/\bHCI\b/i, /\bCSCW\b/i, /\bhuman[-\s]computer\s+interaction\b/i, /\bscience\s*(and|&|,)\s*technology\s*stud(ies|y)\b/i, /\bSTS\b/i, /\bscience,?\s*technology,?\s*(and\s*)?society\b/i]],
  ["Design", [/\bdesign\s+(stud(y|ies)|research|practice)\b/i, /\buser\s+experience\b/i, /\bUX\b/i, /\bvisual\s+communication\b/i]],
  ["Law", [/\blaw\b/i, /\blegal\s+stud(y|ies)\b/i, /\bjurisprudence\b/i]],
  ["Public Health", [/\bpublic\s+health\b/i]],
  ["Urban / Geography", [/\burban\s+stud(y|ies)\b/i, /\bgeograph(y|er|ic)\b/i]],
  ["Heritage / Culture", [/\bheritage\s+management\b/i, /\bcultural\s+stud(y|ies)\b/i, /\bculture\b/i]],
  // Engineering / pure-science / tech disciplines. Surfacing them as
  // first-class field tags lets users with non-HSS profiles filter usefully.
  ["Computer Science / AI / Data",
    [/\bcomputer\s+(science|engineering)\b/i, /\bdata\s+scien(ce|ces)\b/i,
     /\bartificial\s+intelligence\b/i, /\bmachine\s+learning\b/i, /\b\bAI\/?ML\b/,
     /\bsoftware\s+engineering\b/i, /\binformation\s+technology\b/i, /\bIT\s+systems?\b/i]],
  ["Electrical / Electronics",
    [/\belectrical\s+engineering\b/i, /\belectronics?\s+engineering\b/i,
     /\bcommunication\s+engineering\b/i, /\bsignal\s+processing\b/i,
     /\bVLSI\b/i, /\bsemiconductor\b/i, /\bphotonics?\b/i]],
  ["Mechanical / Aerospace",
    [/\bmechanical\s+engineering\b/i, /\baerospace\s+engineering\b/i,
     /\baeronautical\s+engineering\b/i, /\bapplied\s+mechanics\b/i,
     /\brobotics?\b/i, /\bautomotive\s+engineering\b/i,
     /\b(thermal|fluid)\s+engineering\b/i]],
  ["Civil / Environmental",
    [/\bcivil\s+engineering\b/i, /\benvironmental\s+(engineering|science)\b/i,
     /\bstructural\s+engineering\b/i, /\bgeotechnical\b/i, /\btransportation\s+engineering\b/i,
     /\bwater\s+resources?\s+engineering\b/i]],
  ["Chemical Engineering",
    [/\bchemical\s+engineering\b/i, /\bprocess\s+engineering\b/i, /\bbioprocess\b/i,
     /\bcatalysis\b/i]],
  ["Materials / Metallurgical",
    [/\bmaterials?\s+(science|engineering)\b/i, /\bmetallurgical\s+engineering\b/i,
     /\bmetallurgy\b/i, /\bnanoscience\b/i, /\bnanotechnolog/i]],
  ["Mathematics / Statistics",
    [/\bmathematics\b/i, /\bapplied\s+mathematics\b/i, /\bstatistics\b/i, /\bbiostatistics\b/i]],
  ["Physics", [/\bphysics\b/i, /\bastrophysics\b/i, /\bquantum\s+(physics|optics|computing)\b/i]],
  ["Chemistry", [/\bchemistry\b/i, /\borganic\s+chem/i, /\binorganic\s+chem/i, /\banalytical\s+chem/i]],
  ["Biology / Biotech / Biomedical",
    [/\bbiolog(y|ical)\s+(sciences?)?\b/i, /\bbiotechnolog(y|ies)\b/i, /\bbiosciences?\b/i,
     /\bbioengineering\b/i, /\bbioinformatics\b/i, /\bbiomedical\s+(engineering|sciences?)\b/i,
     /\bgenetics\b/i, /\bmicrobiolog/i, /\bneuroscience\b/i]],
  ["Earth / Ocean Sciences",
    [/\bearth\s+sciences?\b/i, /\bgeolog(y|ical)\b/i, /\bocean\s+(engineering|sciences?)\b/i,
     /\batmospheric\s+sciences?\b/i, /\bclimate\s+sciences?\b/i]],
  ["Energy / Sustainability",
    [/\benergy\s+(engineering|science|systems?|policy)\b/i, /\brenewable\s+energy\b/i,
     /\bsustainability\b/i, /\bclean\s+energy\b/i]],
  ["Industrial / Operations",
    [/\bindustrial\s+engineering\b/i, /\boperations\s+research\b/i,
     /\bsystems\s+and\s+control\b/i, /\bdecision\s+sciences?\b/i]],
  ["Medical / Pharmacy",
    [/\bmedical\s+sciences?\b/i, /\bpharmac(y|ology|euticals?)\b/i, /\bclinical\s+research\b/i,
     /\bnursing\b/i, /\bdental\b/i]],
];
export const FIELD_FALLBACK_RULES = FIELD_RULES
  .filter(([label]) => ![
    "Development Studies", "Education", "Political Science", "Public Policy",
    "Media / Communication", "Finance / Capital Markets", "Management / Business",
  ].includes(label));
export const CORE_OUT_OF_SCOPE_RE = /\b(aerospace|applied\s+mechanics|biomedical|biosciences?|bioengineering|biotechnology|chemical\s+engineering|chemistry|civil\s+engineering|computer\s+science|data\s+science|artificial\s+intelligence|electrical\s+engineering|electronics?|energy\s+science|environmental\s+science|industrial\s+engineering|operations\s+research|mathematics|mechanical\s+engineering|metallurgical|materials\s+science|semiconductor|systems\s+and\s+control|medical\s+sciences?|physics|ocean\s+engineering|earth\s+sciences?|robotics|security\s+engineer|technical\s+support)\b/i;

export const QUALITY_LABELS = {
  hss: "HSS",
  "non-hss": "non-HSS",
  other: "Other",
};

// Engineering, pure-science, and tech disciplines that we surface as
// first-class field tags (so users CAN filter on them) but which are
// non-HSS for relevance-bucket purposes. Without this set, a Chemistry
// position at IISER Tirupati would be tagged "Chemistry" → relevance="hss"
// because the old code treated any positive tag as HSS.
export const NON_HSS_FIELD_TAGS = new Set([
  "Computer Science / AI / Data", "Electrical / Electronics",
  "Mechanical / Aerospace", "Civil / Environmental", "Chemical Engineering",
  "Materials / Metallurgical", "Mathematics / Statistics", "Physics",
  "Chemistry", "Biology / Biotech / Biomedical",
  "Earth / Ocean Sciences", "Energy / Sustainability",
  "Industrial / Operations", "Medical / Pharmacy",
  // Finance / Management / Business sit outside the HSS framing for this
  // dashboard's primary user. Without this exclusion, any IIT engineering
  // ad whose areas mention "supply chain" or "finance" was flagged HSS.
  "Finance / Capital Markets", "Management / Business",
]);

/** First structured_position record on the ad, or null. */
export function getStructuredPosition(ad = {}) {
  if (ad.structured_position) return ad.structured_position;
  if (Array.isArray(ad.structured_positions) && ad.structured_positions.length) return ad.structured_positions[0];
  return null;
}

/** Three-bucket profile classifier: hss | ambiguous | excluded. */
export function classifyAd(ad) {
  const sp = getStructuredPosition(ad);
  // Identifying fields: what the post IS. Negatives run only here to avoid
  // killing legit HSS posts whose broader raw_text_excerpt contains institute
  // boilerplate (e.g. "School of Engineering" appearing on a Centre for
  // Educational Technology ad from IIT Bombay).
  const core = [ad.title, sp?.department, sp?.discipline, sp?.school_or_centre, ...(sp?.areas || []), ad.department, ad.discipline, ad.ad_number]
    .filter(Boolean).join(" | ");
  const full = [core, sp?.raw_section_text, ad.pdf_excerpt, ad.raw_text_excerpt].filter(Boolean).join(" | ");
  // Core fields decide first. This prevents a STEM/business title from being
  // marked HSS just because the surrounding page boilerplate says "liberal
  // education", while still keeping explicitly HSS titles visible.
  if (PROFILE_POS_A.some(r => r.test(core))) return "hss";
  if (PROFILE_POS_B.some(r => r.test(core))) return "ambiguous";
  if (PROFILE_NEG.some(r => r.test(core))) return "excluded";
  if (PROFILE_POS_A.some(r => r.test(full))) return "hss";
  if (PROFILE_POS_B.some(r => r.test(full))) return "ambiguous";
  if (FACULTY_HINT.test(full)) return "ambiguous";
  return "excluded";
}

/** Field-tag list. Returns 1+ labels from FIELD_RULES that match the ad. */
export function fieldTags(ad) {
  const sp = getStructuredPosition(ad);
  const core = [ad.title, sp?.department, sp?.discipline, sp?.school_or_centre, ...(sp?.areas || []), ad.department, ad.discipline]
    .filter(Boolean).join(" | ");
  const full = [core, sp?.raw_section_text, ad.pdf_excerpt, ad.raw_text_excerpt].filter(Boolean).join(" | ");
  const match = (text, ruleset = FIELD_RULES) => ruleset
    .filter(([, rules]) => rules.some(r => r.test(text)))
    .map(([label]) => label);
  const tags = match(core);
  if (tags.length) return [...new Set(tags)];
  if (CORE_OUT_OF_SCOPE_RE.test(core)) return ["Other"];
  if (classifyAd(ad) === "excluded") return ["Other"];
  if (typeof ad.parse_confidence === "number" && ad.parse_confidence < 0.45) {
    return ["General / unspecified"];
  }
  const fallback = match(full, FIELD_FALLBACK_RULES);
  if (fallback.length) return [...new Set(fallback)].slice(0, 3);
  if (FACULTY_HINT.test(full)) return ["General / unspecified"];
  return ["Other"];
}

export function primaryField(ad) {
  return fieldTags(ad)[0] || "Other";
}

/** Collapse rank variants (e.g. Asst Prof Grade I/II) to canonical ranks. */
export function condenseRanks(ranks) {
  const norm = (r) => {
    const lr = String(r || "").toLowerCase().trim();
    if (lr.startsWith("assistant professor") || lr === "ap" || lr.startsWith("ap-grade") || lr.startsWith("ap grade")) return "Assistant Professor";
    if (lr.startsWith("associate professor of practice")) return "Assoc Prof of Practice";
    if (lr.startsWith("associate professor")) return "Associate Professor";
    if (lr.startsWith("professor of practice")) return "Prof of Practice";
    if (lr === "professor" || lr.startsWith("professor ") || lr === "full professor") return "Professor";
    return String(r);
  };
  const seen = new Set();
  const out = [];
  for (const r of ranks) {
    const n = norm(r);
    if (!seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

/** Compact display form: "Assistant Professor" → "Asst Prof". */
export function abbreviateRank(r) {
  return String(r || "")
    .replace(/^Assistant Professor$/i, "Asst Prof")
    .replace(/^Associate Professor$/i, "Assoc Prof")
    .replace(/^Professor$/i, "Prof");
}

/** Three-way relevance bucket: hss | non-hss | other.
 *
 * Rules:
 *   - No tags or only "General / unspecified" → other
 *   - Only "Other" or only non-HSS science/engineering tags → non-hss
 *   - Any HSS-relevant tag (anthro, sociology, etc.) → hss, even if mixed
 *     with non-HSS tags (the HSS framing wins for the dissertation user). */
export function relevanceTag(ad) {
  const tags = fieldTags(ad);
  if (tags.length === 0) return "other";
  const isOos = t => t === "Other";
  const isGenericHSS = t => t === "General / unspecified";
  const isNonHSS = t => NON_HSS_FIELD_TAGS.has(t) || isOos(t);
  const hssTags = tags.filter(t => !isNonHSS(t) && !isGenericHSS(t));
  if (hssTags.length > 0) return "hss";
  if (tags.some(isNonHSS)) return "non-hss";
  return "other";
}

// Repurposed alias: returns the user-facing Relevance bucket. The previous
// parser-quality logic ("ready / review / archive") was a maintainer
// concern, not a user filter — it lives on as a debug-only consideration
// inside relevanceTag() indirectly via the field tags. The function name
// is preserved so all the call-sites keep working.
export function listingStatus(ad) { return relevanceTag(ad); }
