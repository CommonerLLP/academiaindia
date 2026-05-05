// ---------- imports ----------
// Pure helpers extracted to lib/ so they can be unit-tested in Node.
// Anything that doesn't touch DOM/state should live there.
import { escapeHTML, escapeAttr, escapeRegExp, safeUrl, resolveUrl } from "./lib/sanitize.js";
import {
  getStructuredPosition,
  classifyAd,
  fieldTags,
  primaryField,
  condenseRanks,
  abbreviateRank,
  relevanceTag,
  listingStatus,
  FIELD_ORDER,
  HSS_SUBJECT_FILTER_LABELS,
  QUALITY_LABELS,
} from "./lib/classify.js";
import {
  sanitizeExcerpt,
  SUBSTANTIVE_MARKERS,
  INSTITUTIONAL_BOILERPLATE,
} from "./lib/excerpt.js";
import {
  STATUTORY_TARGETS, CAT_FULL_NAMES, CORPUS_STATS,
  computeIneq, vacRateChart, realisationChart,
  chart0_volume, chart5_disclosure_v2, chartx_boilerplate, charty_topics,
  chartCard,
  chart1_vacancyTimeline, chart2_mandateVsReality, chart3_kharge,
  chart4_aiims, chart5_disclosure, chart6_whoIsAsking, chart7_rdGap,
  chart8_counterfactual,
  realisationSlopeChart, realisationDonut, rdGapPanel, talentPipeline,
  castePyramid, counterfactualTicker, khargeRankMatrix,
  vacancyTimelineChart, missionModeRealisationChart, disclosureMatrix,
  aiimsNetworkPanel, mpsAskingPanel,
  RTI_TEMPLATES, POSTDOC_ABROAD, RESOURCES_BLOCKS,
  renderVacancies,
} from "./lib/charts.js";

// ---------- state ----------
let ADS = [];
let COVERAGE = null;
let INSTITUTIONS = {};
const TYPE_ORDER = ["IIT","IIM","PrivateUniversity","IISc","IISER","CentralUniversity","NIT","IIIT"];
const TYPE_COLORS = {
  IIT: "#1F4E79", IIM: "#2d6a4f", IISc: "#6b21a8", IISER: "#b45309",
  NIT: "#64748b", IIIT: "#0e7490", CentralUniversity: "#92400e",
  PrivateUniversity: "#7c3aed",
};
const SAVED_KEY = "hei-tracker-saved";
const SAVED = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"));
const persistSaved = () => localStorage.setItem(SAVED_KEY, JSON.stringify([...SAVED]));
const typeLabel = (type) => ({
  CentralUniversity: "Central University",
  PrivateUniversity: "Private University",
}[type] || type);

// ---------- classifier (extracted) ----------
// classifyAd, fieldTags, primaryField, FIELD_RULES, FIELD_ORDER,
// HSS_SUBJECT_FILTER_LABELS, QUALITY_LABELS, NON_HSS_FIELD_TAGS, and the
// PROFILE_POS_A / PROFILE_POS_B / PROFILE_NEG / FACULTY_HINT regex banks
// all live in docs/lib/classify.js. Imported above. Tested in tests/.

// ---------- helpers ----------
// escapeHTML, escapeAttr, escapeRegExp imported from lib/sanitize.js (top of file).

// Per-listing campus detection. Multi-campus institutions (Azim Premji
// Bengaluru / Bhopal / Ranchi; AIIMS; BITS Pilani; etc.) carry one
// registry city — usually the main campus. When the ad text actually
// names a different campus, that's the campus the candidate would
// move to. Override the registry default with what the ad says.
function detectAdCampus(ad) {
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""}`;
  if (!text) return null;
  // "Campus Bhopal" / "Campus: Bhopal"
  let m = text.match(/\bCampus[:\s]+([A-Z][a-zA-Z]+)\b/);
  if (m) return m[1];
  // "Bhopal Campus" / "Bhopal campus"
  m = text.match(/\b([A-Z][a-zA-Z]+)\s+(?:Campus|campus)\b/);
  if (m) return m[1];
  // "based in X" / "located in X"
  m = text.match(/\b(?:based|located|positioned)\s+(?:in|at)\s+([A-Z][a-zA-Z]+)\b/i);
  if (m) return m[1];
  return null;
}

function cityAlreadyInInstitutionName(instName, city) {
  if (!instName || !city) return false;
  // Multi-campus brands need the location even when the brand is familiar:
  // Azim Premji University has Bengaluru/Bhopal/Ranchi; Shiv Nadar has
  // separate Uttar Pradesh and Chennai institutions. Keep the campus visible.
  if (/\b(azim\s+premji|shiv\s+nadar)\b/i.test(instName)) return false;
  const aliases = {
    "new delhi": ["new delhi", "delhi"],
    delhi: ["new delhi", "delhi"],
    bengaluru: ["bengaluru", "bangalore"],
    bangalore: ["bengaluru", "bangalore"],
    mumbai: ["mumbai", "bombay"],
    bombay: ["mumbai", "bombay"],
    chennai: ["chennai", "madras"],
    madras: ["chennai", "madras"],
  };
  const key = String(city).toLowerCase().trim();
  const names = aliases[key] || [key];
  return names.some(name => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(instName));
}


// safeUrl + resolveUrl are imported from lib/sanitize.js (top of file).

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

function urgencyTier(ad) {
  // Thresholds reflect academic-application reality, not generic deadline UX:
  // ≤7 days is genuinely tight (need recommenders + statement), ≤30 days is
  // already "should be working on this", >30 is "ok, plan it." Tightened from
  // the previous 3/14 thresholds, which under-flagged real time pressure.
  const d = daysUntil(ad.closing_date);
  if (d == null) return "unknown";
  if (d < 0) return "closed";
  if (d <= 7) return "critical";
  if (d <= 30) return "soon";
  return "ok";
}

function formatDate(s) {
  const d = parseDate(s);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatCountdown(ad) {
  const d = daysUntil(ad.closing_date);
  if (d == null) return "";
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  if (d === 1) return "1 day left";
  return `in ${d} days`;
}

function daysSince(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const seen = new Date(d); seen.setHours(0,0,0,0);
  return Math.max(0, Math.round((today - seen) / 86400000));
}

function sourceLabel(ad) {
  if (ad._source_method === "public-interest override") return "official source";
  if (ad._source_method === "stale carry-forward") return "carried forward";
  if (ad._source_method === "curated rolling call" || ad._rolling_stub || ad._manual_stub) return "rolling call";
  if (ad._curated_iit || ad._pdf_parsed) return "verified PDF";
  if (ad._source_method === "official scrape") return "parsed page";
  return "parsed source";
}

function sourceLinkLabel(ad) {
  if (ad._rolling_stub || ad._manual_stub) return "Official source →";
  if (ad._pdf_parsed || (ad.original_url || "").toLowerCase().includes(".pdf")) return "Original PDF →";
  return "Official listing →";
}

// ---------- position-type helpers ----------
// Four mutually-non-exclusive predicates. An ad can match multiple — many
// IIT rolling ads cover Asst/Assoc/Full simultaneously, in which case all
// three checkboxes light up for that ad. We err on inclusive matching so a
// user looking for "Associate Professor" doesn't miss generic faculty ads.
function _t(ad) {
  const sp = getStructuredPosition(ad);
  return [ad.title, sp?.post_type, ...(sp?.ranks || [])].filter(Boolean).join(" ").toLowerCase();
}
function isAsstProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).toLowerCase()) : [];
  if (ranks.some(r => /\bassistant\s+professor\b/.test(r))) return true;
  // "Assistant Professor" explicitly, OR a generic Faculty post that doesn't
  // narrow to a higher rank.
  const t = _t(ad);
  if (/\bassistant\s+professor\b/.test(t)) return true;
  const postType = sp?.post_type || ad.post_type;
  if (postType === "Faculty" && !/\bassociate\s+professor\b|\bprofessor\b|\bvisiting\b|\bpostdoc/.test(t)) return true;
  // The IIT rolling-ad convention bundles all three ranks under a single
  // call — "Faculty (Asst/Assoc/Prof) — …" — count those as Asst.
  if (/\b(asst|assistant)\s*\/\s*(assoc|associate)\b/i.test(ad.title || "")) return true;
  return false;
}
function isAssocProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).toLowerCase()) : [];
  if (ranks.some(r => /\bassociate\s+professor\b/.test(r))) return true;
  const t = _t(ad);
  if (/\bassociate\s+professor\b/.test(t)) return true;
  if (/assoc(iate)?\s*[\/]/i.test(ad.title || "")) return true;  // "Asst/Assoc/Prof"
  return false;
}
function isFullProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).trim().toLowerCase()) : [];
  if (ranks.some(r => r === "professor" || r === "full professor")) return true;
  const t = _t(ad);
  // "Professor" but NOT preceded by Assistant/Associate/Visiting/Adjunct.
  if (/\bprofessor\b/.test(t)
      && !/\b(assistant|associate|visiting|adjunct)\s+professor\b/.test(t)) return true;
  if (/\/\s*prof(essor)?\b/i.test(ad.title || "")) return true;  // "Asst/Assoc/Prof"
  return false;
}
function isResearchMatch(ad) {
  const sp = getStructuredPosition(ad);
  const t = _t(ad);
  const postType = sp?.post_type || ad.post_type;
  return postType === "Research" || postType === "Scientific" || postType === "Postdoc" ||
         /postdoc|post[- ]doc|research\s+fellow/.test(t);
}
// Visiting faculty is a distinct labour category — semester-bound, contractual,
// no tenure track. The other predicates already exclude "visiting" from the
// generic-Faculty branch, so this is additive, not overlapping. Keeps Visiting
// Faculty ads from silently mixing into the Asst/Assoc/Full counts and gives
// candidates an explicit toggle for them.
function isVisitingMatch(ad) {
  const sp = getStructuredPosition(ad);
  if (ad.post_type === "Visiting") return true;
  if (sp?.post_type === "Visiting" || sp?.contract_status === "Visiting") return true;
  return /\bvisiting\s+(faculty|professor|fellow|scholar|lecturer)\b/.test(_t(ad));
}
// Backwards-compatible alias used by quick-chip handlers and any older code.
const isFacultyMatch = isAsstProfMatch;

// === Display-label helpers for cards ==================================
//
// These translate the raw schema values into the labels a candidate
// actually scans. Two principles:
//
//   1. Indian academic vocabulary, not US imports. The schema's
//      `ContractStatus.TenureTrack` is meaningful to a tiny subset of
//      private universities (Ashoka, Krea, FLAME, IIM-flexi); to
//      everybody else it's noise. Map both Regular and TenureTrack to
//      "Permanent" so the binary that matters in the Indian academic
//      labour market — permanent vs. contract — is what the card says.
//
//   2. Discipline-first card heading. The previous design put the
//      institution's title ("Faculty Positions in History") above
//      everything else. That's the institution's marketing language;
//      it's also redundant once you've also shown the discipline pill,
//      the rank pill, and the contract pill below. The card now leads
//      with the discipline (the candidate's primary scan target),
//      followed by rank · contract, followed by institution + city.
//
// All helpers are pure functions of the ad object so they can be unit-
// tested in isolation if/when frontend tests land.

function contractLabel(cs) {
  // Map ContractStatus enum → Indian academic vocabulary.
  if (cs === "Regular" || cs === "TenureTrack" || cs === "Permanent") return "Permanent";
  if (cs === "Contractual" || cs === "Contract") return "Contract";
  if (cs === "Guest" || cs === "Visiting") return "Visiting";
  return null; // Unknown → omit the line entirely
}


const DEPARTMENT_UNIT_OVERRIDES = new Map([
  ["aerospace engineering", "Department of Aerospace Engineering"],
  ["applied mechanics", "Department of Applied Mechanics"],
  ["biochemical engineering & biotechnology", "Department of Biochemical Engineering & Biotechnology"],
  ["biological sciences and bioengineering", "Department of Biological Sciences and Bioengineering"],
  ["biosciences & bioengineering", "Department of Biosciences & Bioengineering"],
  ["biotechnology", "Department of Biotechnology"],
  ["chemical engineering", "Department of Chemical Engineering"],
  ["chemistry", "Department of Chemistry"],
  ["civil engineering", "Department of Civil Engineering"],
  ["cognitive science", "Department of Cognitive Science"],
  ["computer science & engineering", "Department of Computer Science & Engineering"],
  ["computer science and engineering", "Department of Computer Science and Engineering"],
  ["data science and artificial intelligence", "Department of Data Science and Artificial Intelligence"],
  ["earth sciences", "Department of Earth Sciences"],
  ["economics", "Department of Economics"],
  ["economic sciences", "Department of Economic Sciences"],
  ["electrical engineering", "Department of Electrical Engineering"],
  ["energy science and engineering", "Department of Energy Science and Engineering"],
  ["engineering design", "Department of Engineering Design"],
  ["environmental science and engineering", "Department of Environmental Science and Engineering"],
  ["humanities & social sciences", "Department of Humanities & Social Sciences"],
  ["humanities and social sciences", "Department of Humanities and Social Sciences"],
  ["management studies", "Department of Management Studies"],
  ["materials science and engineering", "Department of Materials Science and Engineering"],
  ["mathematics", "Department of Mathematics"],
  ["mathematics and statistics", "Department of Mathematics and Statistics"],
  ["mechanical engineering", "Department of Mechanical Engineering"],
  ["medical sciences and technology", "Department of Medical Sciences and Technology"],
  ["metallurgical and materials engineering", "Department of Metallurgical and Materials Engineering"],
  ["metallurgical engineering & materials science", "Department of Metallurgical Engineering & Materials Science"],
  ["ocean engineering", "Department of Ocean Engineering"],
  ["physics", "Department of Physics"],
  ["textile & fibre engineering", "Department of Textile & Fibre Engineering"],
]);

function normalizeRecruitingUnitName(unit, ad = {}) {
  if (!unit) return "";
  const raw = String(unit).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  if (/\b(?:job description|application process|developed and maintained by|thrust areas)\b/i.test(raw)) {
    return "";
  }
  let clean = raw
    .replace(/\bInterdisciplina\s+ry\b/gi, "Interdisciplinary")
    .replace(/^Department\s+Of\b/i, "Department of")
    .replace(/^Department\s+Textile\b/i, "Department of Textile")
    .replace(/\bSchool\s+Of\b/g, "School of")
    .replace(/\bCentre\s+Of\b/g, "Centre of")
    .replace(/\bCenter\s+Of\b/g, "Center of")
    .replace(/\s+(?:has|is|offers|provides)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const key = clean.toLowerCase();
  const instId = String(ad.institution_id || "");
  const instType = String((INSTITUTIONS[instId] || {}).type || "");
  const isPublicTechnical = /^(?:iit|nit|iiit|iiser)-/i.test(instId)
    || /^(?:IIT|NIT|IIIT|IISER|IISc|CentralUniversity)$/i.test(instType);
  if (isPublicTechnical && DEPARTMENT_UNIT_OVERRIDES.has(key)) {
    return DEPARTMENT_UNIT_OVERRIDES.get(key);
  }
  if (/^Kanpur Department-Wise Area of Specialization Aerospace Engineering$/i.test(clean)) {
    return "Department of Aerospace Engineering";
  }
  return clean;
}

function normalizeDisciplineName(discipline) {
  return String(discipline || "")
    .replace(/\bInterdisciplina\s+ry\b/gi, "Interdisciplinary")
    .replace(/\s+(?:has|is|offers|provides)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRecruitingUnitFromText(ad = {}) {
  const text = `${ad.title || ""} ${ad.raw_text_excerpt || ""}`.replace(/\s+/g, " ");
  // If the text lists 3+ "School of X" patterns, it's almost certainly a
  // navigation breadcrumb dump (Ahmedabad University, JGU, etc. enumerate
  // every school on the careers page). Don't pick one of them as THE
  // recruiting unit — none is correct.
  const schoolMatches = text.match(/\b(?:School|Faculty|Centre|Center)\s+of\s+[A-Z][A-Za-z]+/g) || [];
  if (schoolMatches.length >= 3) return "";
  const m = text.match(/\b((?:School|Faculty|Centre|Center)\s+of\s+[A-Z][A-Za-z &]+?)(?=\s+(?:has|is|offers|provides|for|We|Campus|Location|$)|[.,;])/);
  return m ? normalizeRecruitingUnitName(m[1], ad) : "";
}

function titleFieldLabel(title) {
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  let m = raw.match(/\b(?:Assistant|Associate)?\s*Professor\s+in\s+(.+)$/i)
    || raw.match(/\bFaculty Positions?\s+in\s+(.+?)(?:\s+[–—-]\s+|$)/i);
  if (!m) return "";
  const field = m[1].trim().replace(/[.,;:]+$/g, "");
  const fixes = {
    "Academic": "Academic Writing",
    "Computer": "Computer Science",
    "Digital": "Digital Marketing",
    "Film &": "Film & Television Management",
    "Political": "Political Science",
  };
  return fixes[field] || field;
}

// The headline of the card — the recruiting unit / field.
// Fallback chain (most-specific first):
//   1. proper department/school/centre name, optionally plus a real subfield
//   2. ad.discipline if the unit is generic or missing
//   3. extracted from title via regex (e.g., "Faculty Positions in History")
//   4. ad.department even if generic (better than nothing)
//   5. derived from post_type (e.g., "Visiting position")
function cardDiscipline(ad) {
  const sp = getStructuredPosition(ad);
  const dept = normalizeRecruitingUnitName(sp?.department || sp?.school_or_centre || ad.department, ad);
  const discipline = normalizeDisciplineName(sp?.discipline || ad.discipline);
  const isProperUnit = dept && /\b(department|centre|center|school|faculty|institute)\b/i.test(dept);
  const isGenericDept = dept && /^(?:humanities|social sciences|various|multiple|all\s+departments)$/i.test(dept.trim());
  if (dept && isProperUnit && !isGenericDept) {
    const unit = dept;
    const sub = discipline && discipline !== dept && !unit.toLowerCase().includes(String(discipline).toLowerCase())
      ? String(discipline).trim()
      : "";
    const noisySub = /^(?:sciences?|engineering|department|centre|center|school)$/i.test(sub);
    return sub && !noisySub ? `${unit} — ${sub}` : unit;
  }
  if (discipline) return discipline;
  if (dept && !isGenericDept) return dept;
  // Derive from title
  const title = ad.title || "";
  // Titles sometimes carry the real School even when the scraper left
  // `department` empty, e.g. "Chemistry - School of Continuing Education..."
  // or "Design Engineering and Robotics School of Engineering (SoE)".
  let titleUnit = title.match(/Faculty Positions?\s+in\s+(.+?)\s+[–—-]\s+(School\s+of\s+.+)$/i);
  if (titleUnit) return `${normalizeRecruitingUnitName(titleUnit[2], ad)} — ${titleUnit[1].trim()}`;
  titleUnit = title.match(/[–—-]\s+(.+?)\s+(School\s+of\s+[^()]+(?:\([^)]+\))?)/i);
  if (titleUnit) return `${normalizeRecruitingUnitName(titleUnit[2], ad)} — ${titleUnit[1].trim()}`;
  titleUnit = title.match(/\b(School\s+of\s+[^()]+(?:\([^)]+\))?)/i);
  if (titleUnit) return normalizeRecruitingUnitName(titleUnit[1], ad);
  const inferredUnit = inferRecruitingUnitFromText(ad);
  const titleField = titleFieldLabel(title);
  if (inferredUnit && titleField) return `${inferredUnit} — ${titleField}`;
  if (inferredUnit) return inferredUnit;
  if (!dept && !discipline && /^Faculty Positions?\s+in\s+/i.test(title)) return title.trim();
  let m = title.match(/(?:in|of|for)\s+([A-Z][a-zA-Z &/-]+?)(?:\s*\(|$|,|\s+[—–-])/);
  if (m) return m[1].trim();
  m = title.match(/(?:Faculty|Position[s]?|Recruitment)\s*[—–-]\s*([A-Z][a-zA-Z &/-]+)/);
  if (m) return m[1].trim();
  if (/rolling|all\s+areas|multiple/i.test(title)) return "Faculty (all areas)";
  // Generic dept as a last resort before post_type fallback
  if (dept) return dept;
  if (ad.post_type === "Visiting") return "Visiting position";
  if (ad.post_type === "Research" || ad.post_type === "Scientific") return "Research / Postdoc";
  if (ad.post_type === "NonFaculty") return "Non-faculty";
  return "Faculty position";
}

// Parse the messy raw-text excerpt into structured cues a candidate can
// scan. Indian academic ads have a recognisable shape — most of them
// open with a paragraph that names sub-areas / specialisations,
// methods preferences, and a disciplinary frame, followed by long
// boilerplate about "specialisation must be clearly evidenced through
// research and publications in the relevant area." We extract the high-
// signal pieces and drop the boilerplate.
//
// Always returns `{ areas, methods, approach, eligibility, evaluation }`
// (values are null when
// not extractable). The card renderer surfaces each piece — even when
// missing — with explicit "Not specified by the department" labelling
// so a reader scrolling through 30 cards SEES the pattern of
// institutional silence rather than having it hidden by absence. Cf.
// the same logic on the reservation row ("composite recruitment, per-
// post breakdown not disclosed"): naming the absence is the political
// point.
function canonicalAreaLabel(s) {
  return String(s || "")
    .replace(/\bHealth innovations?\s*(?:&|and)\s*systems?\b/i, "Health Innovations")
    .replace(/\bInnovation Systems?\s*(?:&|and)\s*Processes\b/i, "Innovation Systems")
    .replace(/\bInternet,\s*Digital Information\s*(?:&|and)\s*Society\b/i, "Digital Information & Society")
    .replace(/\bTechnical Higher Education\b/i, "Technical Higher Education")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanNumberedCueItem(s) {
  return canonicalAreaLabel(String(s || "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/\([^)]*ver\.[^)]*\)/gi, " ")
    .replace(/\s*[–-]\s+(?:Potential|Maximum age|At least|First class|Publications?|Academic Background|Teaching|Other)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:those with professional experience|physical disability|may also be relaxed|candidates?\s+\(|First class|Potential for|Maximum age|At least)\b[\s\S]*$/i, "")
    .replace(/[.;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

function extractNumberedCueItems(text) {
  const anchor = text.search(/\b(?:specific\s+areas?\s+of|areas?\s+of\s+speciali[sz]ation|following\s+(?:areas?|speciali[sz]ations?))\b/i);
  const windowText = anchor >= 0 ? text.slice(anchor) : text;
  // Marker grammar: parenthesised token (i), (ii), (1), (1a), (1-iii),
  // (a), (b)  OR  unparenthesised "1." / "1)" / "a." Roman numerals
  // (i…iv etc.) are essential here — many Indian academic ads
  // enumerate sub-areas as (i) (ii) (iii) rather than (1) (2) (3).
  const MARKER = `\\((?:[ivx]{1,4}|[a-z]|\\d{1,2}(?:-[ivx]+|[a-z])?)\\)|\\d{1,2}[.)]`;
  const numberedRe = new RegExp(
    `(?:^|\\s)(${MARKER})\\s+([\\s\\S]*?)(?=\\s+(?:${MARKER})\\s+|$)`, "gi"
  );
  const items = [];
  let m;
  while ((m = numberedRe.exec(windowText)) && items.length < 20) {
    const item = cleanNumberedCueItem(m[2]);
    if (!item || item.length < 3 || item.length > 80) continue;
    if (/^(?:No|Page|Annexure|Sr|Academic Unit|Areas of Speciali[sz]ation)$/i.test(item)) continue;
    if (/\b(?:Grade|Publication Record|Academic Background|Teaching Requirement)\b/i.test(item)) continue;
    items.push(item);
  }
  return [...new Set(items)];
}

function summarizeEligibilityCue(text, ad = {}) {
  const combined = [
    ad.unit_eligibility,
    ad.general_eligibility,
    text,
  ].filter(Boolean).join(" ");

  const bits = [];
  if (/\bPh\.?\s*D\.?\b/i.test(combined)) {
    let phd = "PhD";
    if (/\bfirst\s+class\b[^.]{0,80}\bpreceding\s+degree\b/i.test(combined)) {
      phd += " + first class preceding degree";
    }
    bits.push(phd);
  }
  if (/\bGrade\s*I\b[\s\S]{0,120}\bpost[-\s]?PhD\b/i.test(combined) || /\bpost[-\s]?PhD\b[\s\S]{0,120}\bGrade\s*I\b/i.test(combined)) {
    bits.push("Grade I: post-PhD experience expected");
  }
  if (/\bGrade\s*II\b[\s\S]{0,120}\bpost[-\s]?PhD\s+experience\s+is\s+desirable\s+but\s+not\s+required\b/i.test(combined)) {
    bits.push("Grade II: post-PhD desirable, not required");
  } else if (/\bpost[-\s]?PhD\s+experience\s+is\s+desirable\s+but\s+not\s+required\b/i.test(combined)) {
    bits.push("Post-PhD desirable, not required");
  }
  const age = combined.match(/\bmaximum\s+age\s+of\s+(\d{2})\s+years?\s+for\s+male\s+and\s+(\d{2})\s+years?\s+for\s+female\b/i);
  if (age) bits.push(`Age cap: ${age[1]}(M), ${age[2]}(F)`);

  return bits.length ? bits.slice(0, 4).join("; ") : null;
}

function summarizeEvaluationCue(text, ad = {}) {
  const combined = [
    ad.publications_required,
    text,
  ].filter(Boolean).join(" ");
  const publicationSource = ad.publications_required || text;
  const bits = [];

  const pub = publicationSource.match(/\bAt\s+least\s+(\d+)\s+([^.;]{0,120}?(?:papers?|publications?|articles?)[^.;]{0,140}?(?:peer[-\s]?reviewed|journals?|conferences?)[^.;]*)/i)
    || publicationSource.match(/\bminimum\s+of\s+(\d+)\s+([^.;]{0,120}?(?:papers?|publications?|articles?)[^.;]*)/i);
  if (pub) {
    bits.push(`Publications: ${pub[1]}+ ${pub[2].replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim()}`);
  }
  if (/\bsingle-author\s+scholarly\s+book\b[\s\S]{0,120}\bequivalent\s+to\s+up\s+to\s+five\s+journal\s+articles\b/i.test(combined)) {
    bits.push("Books/chapters considered as equivalents");
  }
  if (/\bpotential\s+for\s+(?:very\s+)?good\s+teaching\b/i.test(combined)) {
    bits.push("Teaching potential assessed");
  }

  return bits.length ? bits.slice(0, 2).join("; ") : null;
}

function structuredEligibilityCue(pos) {
  if (!pos) return null;
  const q = pos.qualifications || {};
  const bits = [];
  if (q.phd) bits.push(`PhD ${q.phd}`);
  if (q.first_class_preceding_degree) bits.push(`First class preceding degree ${q.first_class_preceding_degree}`);
  if (typeof q.post_phd_experience_years === "number") bits.push(`${q.post_phd_experience_years}y post-PhD experience`);
  if (q.other) bits.push(q.other);
  if (pos.specific_eligibility) bits.push(pos.specific_eligibility);
  if (!bits.length && pos.general_eligibility) bits.push(pos.general_eligibility);
  return bits.length ? bits.slice(0, 3).join("; ") : null;
}

function structuredEvaluationCue(pos) {
  if (!pos) return null;
  const q = pos.qualifications || {};
  const bits = [];
  if (q.publications_required) bits.push(`Publications: ${q.publications_required}`);
  if (q.teaching_experience) bits.push(`Teaching: ${q.teaching_experience}`);
  return bits.length ? bits.slice(0, 2).join("; ") : null;
}

function structuredCues(ad = {}) {
  const pos = getStructuredPosition(ad);
  if (!pos) return {};
  return {
    areas: Array.isArray(pos.areas) && pos.areas.length ? pos.areas : null,
    methods: pos.methods_preference || null,
    approach: pos.approach || null,
    eligibility: structuredEligibilityCue(pos),
    evaluation: structuredEvaluationCue(pos),
  };
}

function extractCardCues(text, ad = {}) {
  text = String(text || "");
  const cues = { areas: null, methods: null, approach: null, eligibility: null, evaluation: null };
  const hasStructuredFields = Boolean(ad.unit_eligibility || ad.general_eligibility || ad.publications_required);
  if (text.length < 30 && !hasStructuredFields) return cues;

  // --- Sub-areas list -------------------------------------------------
  const numberedAreas = extractNumberedCueItems(text);
  if (numberedAreas.length >= 2 && numberedAreas.length <= 20) {
    cues.areas = numberedAreas;
  }

  // Patterns: "in (the )?area(s) of X, Y, Z…" / "specialisation in X, Y"
  // The trailing lookahead stops the capture at a sentence end, a
  // semicolon, or a "with …" clause that introduces methods.
  const areaPatterns = [
    /(?:in|across)\s+(?:the\s+)?(?:area|areas|fields?|domains?|specializations?|specialisations?|topics?)\s+of\s+([^.]{8,400}?)(?=\s*(?:\.|;|\(with\s|with\s+a\s+|$))/i,
    /(?:research\s+(?:areas?|interests?))\s*[:\-–]\s*([^.]{8,400}?)(?=\s*(?:\.|;|$))/i,
    /(?:specialization|specialisation|expertise)\s+in\s+([^.]{8,400}?)(?=\s*(?:\.|;|with\s+a\s+|$))/i,
  ];
  for (const re of cues.areas ? [] : areaPatterns) {
    const m = text.match(re);
    if (m) {
      const areas = m[1]
        .replace(/\([^)]*\)/g, ' ')                     // strip parentheticals
        .replace(/-\s+/g, '-')                          // "multi- species" -> "multi-species"
        .replace(/\s+/g, ' ')                           // collapse double spaces
        .split(/\s*,\s*|\s*;\s*|\s+(?:and|or|&)\s+/)    // split on , ; and or &
        .map(s => canonicalAreaLabel(s.trim().replace(/[.,;:]+$/, '')))
        .filter(s => {
          if (!s || s.length < 2 || s.length > 60) return false;
          // Drop low-content phrases that come from awkward source text
          // like "in any one or more of the relevant discipline, …" —
          // splitting "one or more of relevant discipline" yields "one"
          // and "more of relevant discipline", neither of which is an
          // actual research area. (Length >= 2 keeps real acronyms
          // like "AI" while the connective-word filter keeps out "or",
          // "of", "to", etc.)
          if (/^(?:the|a|an|one|two|three|few|many|more|other|any|some|all|various|relevant|candidate|applicant)\b/i.test(s)) return false;
          if (/\b(?:relevant\s+discipline|candidate|applicant|the\s+area)s?\b/i.test(s)) return false;
          // Require at least one alphabetic character
          if (!/[a-zA-Z]/.test(s)) return false;
          return true;
        });
      if (areas.length >= 2 && areas.length <= 20) {
        cues.areas = areas;
        break;
      }
    }
  }

  // --- Methods preference ---------------------------------------------
  // "with a strong focus on quantitative research"
  // "either ethnographic or quantitative methods"
  // "grounding in mixed methods"
  let m = text.match(/(?:with\s+a\s+)?(?:strong\s+)?focus(?:ed|ing)?\s+on\s+([\w\s,/-]{5,80}?)\s+(?:research|methods?|approach)/i);
  if (m) {
    cues.methods = m[1].trim().replace(/\s+/g, ' ');
  } else {
    m = text.match(/grounding\s+in\s+(?:either\s+)?([\w\s,/-]{5,80}?)\s+methods?/i);
    if (m) cues.methods = m[1].trim().replace(/\s+/g, ' ');
  }

  // --- Disciplinary approach ------------------------------------------
  // "sociological/anthropological approach" / "humanistic approach"
  m = text.match(/\b((?:sociolog\w+|anthropolog\w+|historic\w+|philosoph\w+|cultur\w+|economic\w*|political\w*|geographic\w*|humanist\w+|critical|interdisciplinary|comparative)(?:\s*\/\s*\w+\w+)?)\s+approach/i);
  if (m) cues.approach = m[1];

  cues.eligibility = summarizeEligibilityCue(text, ad);
  cues.evaluation = summarizeEvaluationCue(text, ad);

  // Note: we ALWAYS return the cues object even if every field is null.
  // The renderer surfaces each row explicitly so missing values are
  // labelled "Not specified by the department" rather than hidden.
  return cues;
}

// "Rank · Contract" line. For Visiting the contract is implied so we
// just say "Visiting Faculty"; otherwise the line is "<Rank> · <Contract>".
// Collapse rank variants (e.g. Asst Prof / AP Grade I / AP Grade II) to a
// single canonical rank, then return a deduped abbreviated list. Used by
// cardRankLine to keep the headline compact even when the source PDF
// enumerates many sub-grades.

function cardRankLine(ad) {
  const sp = getStructuredPosition(ad);
  if (sp) {
    let rank = "";
    const condensed = condenseRanks(Array.isArray(sp.ranks) ? sp.ranks.filter(Boolean) : []);
    if (condensed.length === 1) rank = condensed[0];
    else if (condensed.length >= 2 && condensed.length <= 4) rank = condensed.map(abbreviateRank).join(" / ");
    else if (condensed.length > 4) rank = "Faculty (multiple ranks)";
    if (!rank && (sp.post_type === "Research" || sp.post_type === "Postdoc" || sp.post_type === "Scientific")) rank = "Postdoc / Research Fellow";
    if (!rank) rank = "Faculty";
    const cs = contractLabel(sp.contract_status);
    if (cs && cs !== "Visiting") return `${rank} · ${cs}`;
    return rank;
  }
  let rank;
  if (ad.post_type === "Visiting") {
    rank = "Visiting Faculty";
  } else if (ad.post_type === "Research" || ad.post_type === "Scientific") {
    rank = "Postdoc / Research Fellow";
  } else if (ad.post_type === "NonFaculty") {
    rank = "Non-faculty staff";
  } else {
    const ranks = [];
    if (isFullProfMatch(ad)) ranks.push("Professor");
    if (isAssocProfMatch(ad)) ranks.push("Associate Professor");
    if (isAsstProfMatch(ad)) ranks.push("Assistant Professor");
    if (ranks.length === 1) rank = ranks[0];
    else if (ranks.length > 1) rank = "Faculty (multiple ranks)";
    else rank = "Faculty";
  }
  const cs = contractLabel(ad.contract_status);
  if (cs && ad.post_type !== "Visiting") return `${rank} · ${cs}`;
  return rank;
}


// ---------- data load ----------
async function loadData() {
  // We used to cache-bust JSON fetches with `?v=${Date.now()}` to defeat the
  // browser's HTTP cache during dev. That worked but billed every reload as a
  // full re-download (1-5 MB of JSON). Instead we use `cache: "no-cache"` in
  // the Fetch API — the browser sends `If-Modified-Since` / `If-None-Match`
  // and the server returns 304 if nothing changed, so reloads are cheap when
  // data hasn't moved.
  const opts = { cache: "no-cache" };
  try {
    const [current, coverage, registry] = await Promise.all([
      fetch("data/current.json", opts).then(r => r.json()),
      fetch("data/coverage_report.json", opts).then(r => r.json()).catch(() => null),
      fetch("data/institutions_registry.json", opts).then(r => r.json()),
    ]);
    ADS = (current.ads || []).filter(ad => {
      const sp = getStructuredPosition(ad);
      const pt = sp ? sp.post_type : ad.post_type;
      return pt !== "NonFaculty";
    });
    COVERAGE = coverage;
    for (const inst of registry) INSTITUTIONS[inst.id] = inst;
    // Footer colophon — surface the data freshness as a human-readable
    // date so visitors can judge whether the site is being maintained.
    const updatedEl = document.getElementById("colophon-updated");
    if (updatedEl && current.generated_at) {
      try {
        const d = new Date(current.generated_at);
        const fmt = d.toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
        updatedEl.textContent = `${fmt} · ${ADS.length} listings tracked`;
      } catch { updatedEl.textContent = current.generated_at; }
    }
  } catch (e) {
    document.getElementById("feed-items").innerHTML = `<div class="banner"><strong>Data unavailable.</strong> Run <code>python scraper/run.py</code> to generate <code>data/current.json</code>.</div>`;
    return;
  }
  populateFilters();
  wireEvents();
  wirePortrait();
  render();
  renderCoverage();
  // Maintainer escape hatch: visiting `…/dashboard/#coverage` opens the
  // (now hidden-from-nav) coverage panel. Keeps the monitoring view
  // accessible to whoever maintains the scraper without showing it to
  // end users.
  if (location.hash === "#coverage") {
    document.querySelectorAll("nav.tabs button[data-tab]").forEach(b => b.classList.remove("active"));
    for (const name of ["listings", "saved", "map", "vacancies", "resources", "coverage"]) {
      const panel = document.getElementById(name + "-tab");
      if (panel) panel.style.display = (name === "coverage") ? "" : "none";
    }
  }
}

// Hide the masthead portrait if the image fails to load (e.g. no logo.jpg
// committed yet). Done via an event listener instead of an inline `onerror=`
// attribute so the page stays CSP-friendly and the failure mode is explicit.
function wirePortrait() {
  const img = document.getElementById("masthead-portrait");
  if (!img) return;
  const fig = img.closest("figure");
  if (img.complete && img.naturalWidth === 0) {
    if (fig) fig.style.display = "none";
    return;
  }
  img.addEventListener("error", () => {
    if (fig) fig.style.display = "none";
  });
}

// ---------- filters ----------
function renderCheckboxes(containerId, options) {
  const c = document.getElementById(containerId);
  c.innerHTML = options.map(o => {
    const disabled = o.disabled ? " disabled" : "";
    const style = o.disabled ? ' style="opacity:0.4"' : "";
    const checked = o.checked ? " checked" : "";
    const cnt = o.count != null ? `<span class="cnt">${o.count}</span>` : "";
    return `<label${style}><input type="checkbox" value="${escapeAttr(o.value)}"${disabled}${checked} /><span class="grow">${escapeHTML(o.label)}</span>${cnt}</label>`;
  }).join("");
  // Browsers (Firefox especially) auto-restore form state on reload, ignoring the
  // `checked` attribute. Force the .checked property after render to match the
  // declared default — otherwise a previous session's selections silently persist.
  c.querySelectorAll("input[type=checkbox]").forEach((el, i) => {
    el.checked = !!options[i].checked;
  });
}

function populateFilters() {
  // Force posgroup checkboxes off on every load. The HTML default is also
  // unchecked, but browsers persist checkbox state across reloads — without
  // this reset, a user who once checked "Faculty" would see it ticked on
  // every subsequent visit. Default-unchecked = no posgroup constraint =
  // all post types visible, which is the right empty-state.
  document.querySelectorAll("#filter-posgroup input").forEach(el => { el.checked = false; });
  const search = document.getElementById("search");
  if (search) search.value = "";
  const typeCounts = {}, stateCounts = {}, fieldCounts = {}, qualityCounts = { hss: 0, "non-hss": 0, other: 0 };
  let facultyTotal = 0, associateTotal = 0, fullTotal = 0, researchTotal = 0, visitingTotal = 0;
  for (const ad of ADS) {
    const inst = INSTITUTIONS[ad.institution_id] || {};
    if (inst.type) typeCounts[inst.type] = (typeCounts[inst.type] || 0) + 1;
    if (inst.state) stateCounts[inst.state] = (stateCounts[inst.state] || 0) + 1;
    for (const field of fieldTags(ad)) fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    qualityCounts[listingStatus(ad)]++;
    if (isAsstProfMatch(ad)) facultyTotal++;
    if (isAssocProfMatch(ad)) associateTotal++;
    if (isFullProfMatch(ad)) fullTotal++;
    if (isResearchMatch(ad)) researchTotal++;
    if (isVisitingMatch(ad)) visitingTotal++;
  }

  const orderedFields = [
    ...FIELD_ORDER.filter(f => fieldCounts[f]),
    ...Object.keys(fieldCounts).filter(f => !FIELD_ORDER.includes(f)).sort(),
  ];
  // Default to none checked. "No selection = no constraint" is the same
  // semantics every other facet uses, and it keeps the active-filter chip
  // bar from drowning in 20+ chips on first load.
  renderCheckboxes("filter-hss", orderedFields.map(f => ({
    value: f,
    label: f,
    count: fieldCounts[f],
    checked: false,
  })));

  // Relevance: HSS is profile-relevant (anthro / STS / sociology / public
  // policy / etc.), non-HSS is the engineering / pure-STEM / finance /
  // management bucket the user has explicitly excluded, Other catches the
  // generic-faculty-call ads where no field could be inferred. HSS
  // checked by default — this is a research-tracker for an HSS user.
  renderCheckboxes("filter-quality", [
    { value: "hss", label: QUALITY_LABELS.hss, count: qualityCounts.hss, checked: false },
    { value: "non-hss", label: QUALITY_LABELS["non-hss"], count: qualityCounts["non-hss"], checked: false },
    { value: "other", label: QUALITY_LABELS.other, count: qualityCounts.other, checked: false },
  ]);

  // Render only types that actually appear in the data. TYPE_ORDER pins
  // display order for known types; any unknown types get appended in the
  // order they first appear so we don't silently drop e.g. "Other" or new
  // categories added to the registry.
  const orderedTypes = [
    ...TYPE_ORDER.filter(t => typeCounts[t]),
    ...Object.keys(typeCounts).filter(t => !TYPE_ORDER.includes(t)).sort(),
  ];
  renderCheckboxes("filter-type", orderedTypes.map(t => ({
    value: t,
    label: typeLabel(t),
    count: typeCounts[t],
  })));

  document.getElementById("cnt-faculty").textContent = facultyTotal;
  document.getElementById("cnt-associate").textContent = associateTotal;
  document.getElementById("cnt-full").textContent = fullTotal;
  document.getElementById("cnt-research").textContent = researchTotal;
  document.getElementById("cnt-visiting").textContent = visitingTotal;

  renderCheckboxes("filter-state",
    Object.keys(stateCounts).sort().map(s => ({ value: s, label: s, count: stateCounts[s] }))
  );
}

function getChecked(id) {
  return [...document.querySelectorAll(`#${id} input:checked`)].map(el => el.value);
}

// ---------- event wiring ----------
function wireEvents() {
  for (const id of ["filter-hss","filter-quality","filter-type","filter-posgroup","filter-state"]) {
    document.getElementById(id).addEventListener("change", render);
  }
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("sort").addEventListener("change", render);

  // ---- Phase-2 hero search ---------------------------------------------
  // The hero input is the user-facing field; the legacy `#search` (now a
  // hidden input) is the value the rest of the JS reads. Mirror writes.
  const heroSearch = document.getElementById("hero-search");
  const heroClear = document.getElementById("hero-search-clear");
  const legacySearch = document.getElementById("search");
  if (heroSearch) {
    heroSearch.addEventListener("input", () => {
      legacySearch.value = heroSearch.value;
      heroClear.hidden = heroSearch.value.length === 0;
      render();
    });
    heroClear.addEventListener("click", () => {
      heroSearch.value = "";
      legacySearch.value = "";
      heroClear.hidden = true;
      heroSearch.focus();
      render();
    });
  }

  // ---- Phase-2 quick chips ---------------------------------------------
  // Each chip is a one-click toggle that sets the corresponding sidebar
  // checkboxes. The chip's `on` state mirrors whether *all* of its target
  // boxes are currently checked, so the chip and the sidebar stay in sync
  // even when the user toggles things in the sidebar manually.
  const QUICK_FILTERS = {
    "hss": { groupId: "filter-hss",
             targets: () => Array.from(document.querySelectorAll("#filter-hss input"))
                            .filter(i => i.value !== "Other" && i.value !== "Pure STEM/Engineering") },
    "closing-soon": null,  // handled inline (synthetic — not a checkbox set)
    "faculty": { groupId: "filter-posgroup",
                 targets: () => [document.querySelector('#filter-posgroup input[value="faculty"]')] },
    "postdoc": { groupId: "filter-posgroup",
                 targets: () => [document.querySelector('#filter-posgroup input[value="research"]')] },
  };

  // Synthetic filters — no checkbox group; window-scoped state.
  window._closingSoonOnly = false;
  window._reservedOnly = false;

  const refreshChipStates = () => {
    document.querySelectorAll(".quick-chip").forEach(chip => {
      const key = chip.dataset.quick;
      let on = false;
      if (key === "closing-soon") on = window._closingSoonOnly;
      else if (key === "reserved") on = window._reservedOnly;
      else {
        const cfg = QUICK_FILTERS[key];
        const targets = cfg?.targets()?.filter(Boolean) ?? [];
        on = targets.length > 0 && targets.every(i => i.checked);
      }
      chip.classList.toggle("on", on);
      chip.setAttribute("aria-pressed", on);
    });
  };
  refreshChipStates();

  document.querySelectorAll(".quick-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.quick;
      if (key === "closing-soon") {
        window._closingSoonOnly = !window._closingSoonOnly;
      } else if (key === "reserved") {
        window._reservedOnly = !window._reservedOnly;
      } else {
        const cfg = QUICK_FILTERS[key];
        if (!cfg) return;
        const targets = cfg.targets().filter(Boolean);
        const allOn = targets.every(i => i.checked);
        targets.forEach(i => { i.checked = !allOn; });
      }
      refreshChipStates();
      render();
    });
  });

  // Re-sync chips after every render so manual sidebar toggles keep the
  // chip "on" state honest.
  const _origRender = window.render;
  if (_origRender && !window._chipsHooked) {
    window.render = function() { _origRender.apply(this, arguments); refreshChipStates(); };
    window._chipsHooked = true;
  }

  // ---- Filter-strip popover open/close ---------------------------------
  // Click the trigger to toggle. Click outside to close. ESC closes too.
  // One open at a time so popovers don't overlap.
  // Each open/close also flips `aria-expanded` on the trigger so AT users
  // know the popover state matches what sighted users see.
  const closeAllDropdowns = () => {
    document.querySelectorAll(".filter-dd.open").forEach(d => {
      d.classList.remove("open");
      const trigger = d.querySelector(".filter-trigger");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  };
  document.querySelectorAll(".filter-dd .filter-trigger").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dd = btn.closest(".filter-dd");
      const wasOpen = dd.classList.contains("open");
      closeAllDropdowns();
      if (!wasOpen) {
        dd.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".filter-dd")) closeAllDropdowns();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });
  // Per-popover "Clear" buttons (data-clear="filter-<id>") uncheck every
  // input inside the matching filter-group.
  document.querySelectorAll(".popover-foot button[data-clear]").forEach(btn => {
    btn.addEventListener("click", () => {
      const groupId = btn.dataset.clear;
      document.querySelectorAll(`#${groupId} input`).forEach(i => { i.checked = false; });
      render();
    });
  });

  // Banner dismiss — persist to localStorage so it stays dismissed across reloads.
  const banner = document.getElementById("verify-banner");
  if (banner && localStorage.getItem("hei.banner-dismissed") === "1") {
    banner.style.display = "none";
  }
  document.getElementById("dismiss-banner")?.addEventListener("click", () => {
    banner.style.display = "none";
    localStorage.setItem("hei.banner-dismissed", "1");
  });

  // Theme toggle — sun for "switch to light", moon for "switch to dark".
  // The icon shows the destination theme so the click direction is unambiguous.
  const themeBtn = document.getElementById("theme-toggle");
  const setThemeIcon = () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    themeBtn.textContent = current === "dark" ? "☀" : "☾";
    themeBtn.title = current === "dark" ? "Switch to light mode" : "Switch to dark mode";
  };
  setThemeIcon();
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("hei.theme", next);
    setThemeIcon();
    // Force a repaint of the listings after the theme attribute flip. Some
    // browsers occasionally drop card contents in the transition between
    // CSS-variable values when the attribute changes mid-paint; re-rendering
    // the active tab guarantees the cards land back on screen deterministically.
    try {
      const activeTab = document.querySelector("nav.tabs button.active")?.dataset.tab;
      if (activeTab === "listings") render();
      else if (activeTab === "saved") renderSaved();
      else if (activeTab === "vacancies") renderVacancies();
      else if (activeTab === "resources") renderResources();
    } catch (_) { /* fail open — the visual change is already applied */ }
  });

  // Only buttons that actually represent a panel (have data-tab) participate
  // in tab switching. The theme-toggle is also a <button> inside nav.tabs but
  // has no data-tab — without this guard, clicking it would hide every panel
  // because `btn.dataset.tab` is undefined and no panel name matches.
  // Switch to the named tab — used both by user clicks and by hash routing.
  // Returns true if `name` matched a real tab. The hash is updated only
  // when the caller asks (so initial-load activation doesn't push history).
  // Panels that exist in the DOM but are not rendered as tablist tabs
  // (no <button role="tab"> in nav). These are destinations linked from
  // elsewhere — currently the colophon's "About & methodology →" link.
  const NON_NAV_PANELS = new Set(["about"]);
  // All panels the activator knows about — for the show/hide loop.
  const ALL_PANELS = ["listings", "saved", "map", "vacancies", "resources", "coverage", "about"];

  function activateTab(name, { writeHash = false, focusTab = false } = {}) {
    const btn = document.querySelector(`nav.tabs button[data-tab="${name}"]`);
    const isNonNav = NON_NAV_PANELS.has(name);
    if (!btn && !isNonNav) return false;
    // Flip the visual class AND the WAI-ARIA state on the tablist tabs in
    // lockstep. For a non-nav panel (About), de-select all tabs; the panel
    // is reachable but not "selected" in the tablist sense.
    document.querySelectorAll("nav.tabs button[data-tab]").forEach(b => {
      const isActive = (b === btn);
      b.classList.toggle("active", isActive);
      b.setAttribute("aria-selected", isActive ? "true" : "false");
      b.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    if (focusTab) {
      if (btn) btn.focus();
      else if (isNonNav) document.getElementById(name + "-tab")?.focus();
    }
    for (const n of ALL_PANELS) {
      const panel = document.getElementById(n + "-tab");
      if (panel) panel.style.display = (name === n) ? "" : "none";
    }
    // Filter strip is only meaningful on tabs that filter the ad corpus —
    // Vacancies (the listings feed) and Map. On The Gap, Resources, Saved,
    // and About the filters do nothing; showing them adds clutter and
    // implies they affect those views.
    const filterStrip = document.getElementById("filter-strip");
    if (filterStrip) {
      const filtersApply = (name === "listings" || name === "map");
      filterStrip.style.display = filtersApply ? "" : "none";
    }
    if (name === "map") { initMap(); render(); }
    if (name === "saved") renderSaved();
    if (name === "vacancies") renderVacancies();
    if (name === "resources") renderResources();
    if (writeHash) {
      // Use pushState so back/forward survive the deep-link.
      const hash = name === "listings" ? "" : `#${name}`;
      const url = location.pathname + location.search + hash;
      history.pushState({ tab: name }, "", url);
    }
    return true;
  }

  document.querySelectorAll("nav.tabs button[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab, { writeHash: true }));
  });

  // WAI-ARIA tablist arrow-key navigation. Per
  // https://www.w3.org/WAI/ARIA/apg/patterns/tabs/, ArrowLeft/ArrowRight
  // moves between tabs (wrapping at the ends), Home jumps to the first tab,
  // End to the last. Activating a tab via arrow keys focuses AND switches —
  // the manual-activation pattern is allowed but the automatic-activation
  // pattern matches the existing click behaviour and feels more natural for
  // a small tablist where switching panels is cheap.
  const tablist = document.querySelector("nav.tabs[role=tablist]");
  if (tablist) {
    tablist.addEventListener("keydown", (e) => {
      const tabs = [...tablist.querySelectorAll('button[role="tab"]')];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let next = -1;
      if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      activateTab(tabs[next].dataset.tab, { writeHash: true, focusTab: true });
    });
  }

  // Hash routing: deep links (#vacancies, #resources, #map, #saved, #about)
  // survive refresh, share, and the browser's back/forward buttons.
  // `listings` is the default and uses no hash. Unknown hashes (e.g.
  // #coverage when location.hash is a marketing anchor) are ignored.
  const VALID_TAB_HASHES = new Set(["listings","saved","map","vacancies","resources","about"]);
  function activateFromHash() {
    const h = location.hash.replace(/^#/, "");
    if (h === "coverage") return; // handled separately at load time
    const name = VALID_TAB_HASHES.has(h) ? h : "listings";
    activateTab(name, { writeHash: false });
  }
  // Run once on first wire-up (covers reload-into-#vacancies) and then on
  // every back/forward navigation.
  activateFromHash();
  window.addEventListener("hashchange", activateFromHash);
  window.addEventListener("popstate", activateFromHash);

  // In-page links that jump to a specific tab. Used by the vacancy-gap
  // banner ("See the breakdown by category →") and any other anchor with
  // a data-tab-link attribute. Triggers the same path as a tab click so
  // the panel renders correctly.
  document.body.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-tab-link]");
    if (!a) return;
    e.preventDefault();
    const tab = a.dataset.tabLink;
    const ok = activateTab(tab, { writeHash: true });
    if (!ok) location.href = a.href;
  });
}

// ---------- filtering + sorting ----------
function currentFilterState() {
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

function filterHaystack(ad, inst = {}) {
  const sp = getStructuredPosition(ad);
  return [
    ad.title, ad.department, ad.discipline, inst.name, inst.short_name,
    sp?.department, sp?.discipline, sp?.school_or_centre,
    ...(sp?.areas || []), sp?.methods_preference, sp?.approach,
  ].filter(Boolean).join(" ").toLowerCase();
}

function applyFilters(st) {
  return ADS.filter(ad => {
    const inst = INSTITUTIONS[ad.institution_id] || {};
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
      if (!filterHaystack(ad, inst).includes(st.query)) return false;
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
const HIRING_TRAPS = [
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

function extractTraps(ad) {
  const text = `${ad.title || ""} ${ad.unit_eligibility || ""} ${ad.general_eligibility || ""} ${ad.publications_required || ""} ${ad.raw_text_excerpt || ""}`;
  const out = [];
  for (const t of HIRING_TRAPS) {
    if (t.re.test(text)) out.push({ label: t.label, why: t.why });
  }
  return out;
}

// Centralised "is this a reserved-post ad" check. Used by the chip filter
// AND the per-card render code, so the logic stays consistent.
function isReservedPost(ad) {
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

function applySort(ads, sort) {
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
  const byInstitution = (a, b) => (INSTITUTIONS[a.institution_id]?.name || "").localeCompare(INSTITUTIONS[b.institution_id]?.name || "");
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
function adPassesFilter(ad, st, skipDim) {
  const inst = INSTITUTIONS[ad.institution_id] || {};
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
    if (!filterHaystack(ad, inst).includes(st.query)) return false;
  }
  if (window._reservedOnly && !isReservedPost(ad)) return false;
  return true;
}

function updateReactiveCounts(st) {
  const counts = {
    hss: {},
    quality: { hss: 0, "non-hss": 0, other: 0 },
    type: {},
    state: {},
    posgroup: { faculty: 0, associate: 0, full: 0, research: 0, visiting: 0 },
  };
  for (const ad of ADS) {
    const inst = INSTITUTIONS[ad.institution_id] || {};
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

// ---------- render ----------
function render() {
  // Filters changed (or it's the first render) — reset progressive-load
  // counter so the user always lands on chunk 1, not mid-scroll into a
  // previously-loaded list. The load-more button itself bypasses render()
  // and calls renderAdList directly, so its bump survives.
  renderLimit = RENDER_PAGE_SIZE;
  const st = currentFilterState();
  const filtered = applySort(applyFilters(st), st.sort);

  renderActiveFilters(st);
  renderSummary(filtered, st);
  renderAdList(filtered);
  updateSelCounts(st);
  updateReactiveCounts(st);
  document.getElementById("count-listings").textContent = filtered.length;
  document.getElementById("count-saved").textContent = SAVED.size > 0 ? SAVED.size : "";
  updateMapMarkers(filtered);
}

function renderActiveFilters(st) {
  const chips = [];
  // Field chips: collapse to a single summary chip when >3 are selected so
  // the chip bar stays readable. Click the summary expands inline.
  const fieldsArr = [...st.fields];
  const FIELD_COLLAPSE_THRESHOLD = 4;
  const fieldsCollapsed = fieldsArr.length > FIELD_COLLAPSE_THRESHOLD && !window._fieldsExpanded;
  if (fieldsCollapsed) {
    chips.push({ kind: "hss-summary", val: "", label: `Field × ${fieldsArr.length}` });
  } else {
    for (const v of fieldsArr) chips.push({ kind: "hss", val: v, label: v });
  }
  for (const v of st.statuses) chips.push({ kind: "quality", val: v, label: QUALITY_LABELS[v] || v });
  for (const v of st.types) chips.push({ kind: "type", val: v, label: typeLabel(v) });
  for (const v of st.posGroups) {
    const POS_LABEL = { faculty: "Asst Prof", associate: "Assoc Prof", full: "Full Prof", research: "Postdoc" };
    chips.push({ kind: "posgroup", val: v, label: POS_LABEL[v] || v });
  }
  for (const v of st.states) chips.push({ kind: "state", val: v, label: v });
  if (st.query) chips.push({ kind: "query", val: "", label: `"${st.query}"` });

  const c = document.getElementById("active-filters");
  if (!chips.length) { c.innerHTML = ""; return; }
  c.innerHTML = chips.map(ch => {
    if (ch.kind === "hss-summary") {
      // Summary chip: clicking the label expands; clicking × clears all fields.
      return `<span class="chip-active chip-summary" data-kind="hss-summary" title="Click to expand"><span class="grow">${escapeHTML(ch.label)} ▾</span><button type="button" data-kind="hss-clear" title="Clear all field selections" aria-label="Clear all field selections">×</button></span>`;
    }
    const removeLabel = `Remove filter: ${ch.label}`;
    return `<span class="chip-active">${escapeHTML(ch.label)}<button type="button" data-kind="${ch.kind}" data-val="${escapeAttr(ch.val)}" title="${escapeAttr(removeLabel)}" aria-label="${escapeAttr(removeLabel)}">×</button></span>`;
  }).join("") + `<button type="button" class="chip-clear" id="clear-filters">Clear all</button>`;

  // Expand-on-click for summary chip (clicking anywhere on chip except the ×).
  c.querySelectorAll(".chip-summary").forEach(chip => {
    chip.addEventListener("click", (e) => {
      if (e.target.tagName === "BUTTON") return;
      window._fieldsExpanded = true;
      render();
    });
  });

  c.querySelectorAll(".chip-active button").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const { kind, val } = btn.dataset;
      if (kind === "query") document.getElementById("search").value = "";
      else if (kind === "hss-clear") {
        document.querySelectorAll("#filter-hss input").forEach(el => el.checked = false);
        window._fieldsExpanded = false;
      } else {
        const mapId = { hss: "filter-hss", quality: "filter-quality", type: "filter-type", posgroup: "filter-posgroup", state: "filter-state" }[kind];
        const box = document.querySelector(`#${mapId} input[value="${CSS.escape(val)}"]`);
        if (box) box.checked = false;
      }
      render();
    });
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    document.getElementById("search").value = "";
    ["filter-hss","filter-quality","filter-type","filter-posgroup","filter-state"].forEach(id =>
      document.querySelectorAll(`#${id} input`).forEach(el => el.checked = false));
    window._fieldsExpanded = false;
    render();
  });
}

function renderSummary(filtered, st) {
  const total = ADS.length;
  const active = st.fields.size + st.statuses.size + st.types.size + st.posGroups.size + st.states.size + (st.query ? 1 : 0);
  const el = document.getElementById("summary-row");
  el.innerHTML =
    `<span class="emph">${filtered.length}</span> advertisements shown <span style="color:var(--muted-soft)">of ${total} total</span>` +
    (active > 0 ? `<span class="active-mark">· ${active} filter${active!==1?"s":""} active</span>` : "");
  // Sum of the most recent disclosed standing vacancies we have:
  //   - Central Universities teaching (AU1206, Jul 2025): 4,889
  //   - AIIMS network faculty (AS207, Feb 2026): 5,748
  // = 10,637 minimum. IIT/IIM/NIT/IIIT/IISER vacancies remain undisclosed
  // post-2023 (last comprehensive all-CHEI figure was 14,606, Feb 2023);
  // the true current standing inventory is almost certainly higher.
  const VACANT_FLOOR = 10637;
  const adsEl = document.getElementById("vgb-ads");
  const ratioEl = document.getElementById("vgb-ratio");
  if (adsEl) adsEl.textContent = total.toLocaleString("en-IN");
  if (ratioEl) {
    const ratio = total > 0 ? Math.round(VACANT_FLOOR / total) : "—";
    ratioEl.textContent = `${ratio}× gap.`;
  }
}

function updateSelCounts(st) {
  // Update each filter-strip trigger's pill: show count when ≥1 selection,
  // hide when 0. Also flag the parent .filter-dd as `has-active` so the
  // trigger button itself gets a coloured border state.
  const setPill = (id, n, dim) => {
    const pill = document.getElementById(id);
    if (!pill) return;
    pill.textContent = n;
    pill.hidden = n === 0;
    const dd = pill.closest(".filter-dd");
    if (dd) dd.classList.toggle("has-active", n > 0);
  };
  setPill("selcnt-hss",      st.fields.size,    "field");
  setPill("selcnt-quality",  st.statuses.size,  "quality");
  setPill("selcnt-type",     st.types.size,     "type");
  setPill("selcnt-posgroup", st.posGroups.size, "posgroup");
  setPill("selcnt-state",    st.states.size,    "state");
}

// Progressive-render limit. Default 25 — enough that filtered queries (which
// almost always return ≤25 anyway) render fully without a button, but the
// unfiltered 335-ad case is bounded so initial paint is fast and the user
// gets a clear "you're 25 of 335 in" indicator. Each "Load more" click bumps
// the limit by RENDER_PAGE_SIZE.
const RENDER_PAGE_SIZE = 25;
let renderLimit = RENDER_PAGE_SIZE;

function renderAdList(filtered) {
  const host = document.getElementById("feed-items");
  if (filtered.length === 0) {
    host.innerHTML = `<div class="empty-state">No advertisements match your filters.</div>`;
    return;
  }
  const cap = Math.min(renderLimit, filtered.length);
  const shown = filtered.slice(0, cap);
  let html = shown.map(renderAd).join("");
  if (cap < filtered.length) {
    const remaining = filtered.length - cap;
    const nextChunk = Math.min(RENDER_PAGE_SIZE, remaining);
    html += `<button class="load-more" id="load-more-btn" type="button">
      Showing 1–${cap} of ${filtered.length} <span class="lm-sub">— load ${nextChunk} more ▾</span>
    </button>`;
  } else if (filtered.length > RENDER_PAGE_SIZE) {
    // Fully loaded but it took multiple expansions — confirm completion.
    html += `<div class="load-more-done">Showing all ${filtered.length} advertisements.</div>`;
  }
  host.innerHTML = html;
  wireAdActions(host);
  const btn = document.getElementById("load-more-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      renderLimit += RENDER_PAGE_SIZE;
      renderAdList(filtered);
    });
  }
}

function renderAd(ad) {
  const inst = INSTITUTIONS[ad.institution_id] || { name: ad.institution_id };
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

  const saved = SAVED.has(ad.id);

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

  // Action links: PDF + apply portal + listing page (in that order — original PDF first)
  const actionLinks = [];
  actionLinks.push(`<a href="${escapeAttr(resolveUrl(ad.original_url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(sourceLinkLabel(ad))}</a>`);
  if (ad.annexure_pdf_url) {
    actionLinks.push(`<a href="${escapeAttr(safeUrl(ad.annexure_pdf_url))}" target="_blank" rel="noopener noreferrer">Annexure →</a>`);
  }
  if (ad.info_url && ad.info_url !== ad.original_url) {
    actionLinks.push(`<a href="${escapeAttr(safeUrl(ad.info_url))}" target="_blank" rel="noopener noreferrer">Listing page →</a>`);
  }
  // Fall back to the institution-level apply URL when the ad doesn't
  // carry one. Some ad PDFs (IIT Indore, etc.) just point at the PDF and
  // expect the candidate to find the institute's faculty-recruitment
  // portal separately; the registry holds that portal URL.
  const applyUrl = ad.apply_url || inst.apply_url;
  if (applyUrl) {
    actionLinks.push(`<a href="${escapeAttr(safeUrl(applyUrl))}" target="_blank" rel="noopener noreferrer">Apply portal →</a>`);
  }

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
  const atomicAreas = atomizeAreas(cues.areas);
  const areasValue = atomicAreas.length
    ? `<span class="card-cue-tags">${atomicAreas.map(a => `<span class="card-area-chip">${escapeHTML(a)}</span>`).join("")}</span>`
    : empty;
  const areasHTML = `
    <div class="card-cues">
      <div class="card-cue card-cue-areas${cues.areas ? "" : " is-empty"}">
        <span class="card-cue-label">Topical fit</span>
        ${areasValue}
      </div>
    </div>`;

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
  flags.push(`<span class="card-flag scope ${institutionScope}">${isPrivateInstitution ? "Private" : "Public"}</span>`);
  if (effectivePostCount) {
    flags.push(`<span class="card-flag">${effectivePostCount} ${effectivePostCount === 1 ? "post" : "posts"}</span>`);
  }
  if (ad.publication_date) {
    flags.push(`<span class="card-flag dim">posted ${escapeHTML(formatDate(ad.publication_date))}</span>`);
  }
  // Large deadline column: "66 / DAYS / 30 Jun 2026" or "rolling" or "—".
  let deadlineHTML;
  if (ad.closing_date) {
    const d = daysUntil(ad.closing_date);
    if (d == null || d < 0) {
      deadlineHTML = `<div class="deadline-num small">closed</div><div class="deadline-date">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    } else {
      deadlineHTML = `<div class="deadline-num">${d}</div><div class="deadline-unit">days</div><div class="deadline-date">${escapeHTML(formatDate(ad.closing_date))}</div>`;
    }
  } else {
    deadlineHTML = `<div class="deadline-num small">rolling</div>`;
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
    ? ADS.filter(x => x.original_url === ad.original_url).length
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
  let reservPillsHTML = "";
  const reservInfo = (tip) => `
    <details class="reserv-info">
      <summary aria-label="Explain reservation status"><span aria-hidden="true">?</span></summary>
      <div class="reserv-info-pop">${escapeHTML(tip)}</div>
    </details>`;
  if (isPrivate && !catBits.length) {
    reservPillsHTML = "";
  } else if (catBits.length) {
    reservPillsHTML = `<div class="row-reserv"><span class="reserv-label">Reserved seats</span>${
      catBits.map(([k, v]) => `<span class="reserv-pill r-${escapeAttr(k)}">${escapeHTML(k)}-${v}</span>`).join("")
    }</div>`;
  } else if (isSRD) {
    const tip = "This ad is part of a Special Recruitment Drive for reserved-category candidates — typically SC/ST/OBC/PwBD posts being filled to reduce roster backlog.";
    reservPillsHTML = `<div class="row-reserv reserv-srd"><span class="reserv-label good">✓ Special Recruitment Drive</span>${reservInfo(tip)}</div>`;
  } else if (isCompositeAd) {
    const tip = "Composite or rolling faculty call. The ad may list many departments/areas under one recruitment PDF, but it does not disclose which roster category each selection point maps to.";
    reservPillsHTML = `<div class="row-reserv reserv-missing"><span class="reserv-label warn">⚠ Composite / rolling recruitment</span>${reservInfo(tip)}</div>`;
  } else if (isExplicitSinglePostAd) {
    const tip = "This public-institution ad appears to be for one post/position, but the roster category for that appointment is not disclosed in the advertisement.";
    reservPillsHTML = `<div class="row-reserv reserv-missing reserv-singlepost"><span class="reserv-label warn">⚠ Single post: roster point not disclosed</span>${reservInfo(tip)}</div>`;
  } else {
    const tip = "This public-institution ad does not disclose enough post-wise roster information to tell whether the recruitment is single-post or bulk, or which UR/SC/ST/OBC/EWS/PwBD roster point is being used.";
    reservPillsHTML = `<div class="row-reserv reserv-missing reserv-singlepost"><span class="reserv-label warn">⚠ Roster point not disclosed</span>${reservInfo(tip)}</div>`;
  }
  // Hiring-language traps — surface known exclusion phrases that the ad
  // contains, so candidates can see the structural barriers up front.
  const traps = extractTraps(ad);
  const trapsHTML = traps.length
    ? `<details class="row-traps"><summary><span class="traps-icon">⚑</span> ${traps.length} watch-out${traps.length > 1 ? "s" : ""} in this ad <span class="traps-hint">(click to expand)</span></summary><div class="traps-body">${
        traps.map(t => `<div class="trap"><div class="trap-label">${escapeHTML(t.label)}</div><div class="trap-why">${escapeHTML(t.why)}</div></div>`).join("")
      }</div></details>`
    : "";

  // Always-visible apply/source links — replaces the buried "how to apply"
  // disclosure. Original PDF first (the source-of-truth), then Apply portal
  // (where you actually submit), then Listing page / Annexure if present.
  const applyLinksHTML = actionLinks.length
    ? `<div class="row-actions-inline">${actionLinks.join('')}</div>`
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
  if (publicationDetails) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Publication requirements</span><div class="v">${escapeHTML(publicationDetails)}</div></div>`);
  }
  if (structuredPos?.pay_scale) {
    detailsBlocks.push(`<div class="detail-block"><span class="k">Pay scale</span><div class="v">${escapeHTML(structuredPos.pay_scale)}</div></div>`);
  }
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
          <h3 class="card-institution">${escapeHTML(instName)}${cityPart}</h3>
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

function wireAdActions(host) {
  host.querySelectorAll(".listing .star").forEach(btn => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".listing");
      const id = card.dataset.jobid;
      if (SAVED.has(id)) SAVED.delete(id); else SAVED.add(id);
      persistSaved();
      btn.classList.toggle("on");
      btn.textContent = SAVED.has(id) ? "★" : "☆";
      btn.setAttribute("aria-pressed", SAVED.has(id));
      document.getElementById("count-saved").textContent = SAVED.size > 0 ? SAVED.size : "";
    });
  });
}

// ---------- vacancies tab ----------
// VACANCY_DATA moved to lib/charts.js (module-local).
const GROUP_LABELS = {
  all_central_universities: "All Central Universities",
  all_iits: "All IITs", all_iims: "All IIMs", all_iisers: "All IISERs",
  all_nits: "All NITs", all_iiits: "All IIITs", iisc: "IISc Bangalore",
  all_centrally_funded_heis: "All Centrally-Funded HEIs (aggregate)",
  all_aiims: "All AIIMS (institute network)",
  all_chei_mission_mode: "All CHEIs — Mission Mode cumulative fills",
};
const INST_LABELS = {
  iit_bombay: "IIT Bombay"
};

// Disclosure-regression matrix across BOTH houses (LS + RS), built from the
// close-reading of all 80+ Q&A PDFs in the corpus. Each row: house, question
// number, date, subject, MP who asked, and three Y/N/P columns for whether
// the answer disclosed total / category / institution-wise data. The matrix
// is the operational evidence for the disclosure-regression argument.

// MPs who keep asking. Surfaced so readers see who is doing parliamentary
// work for this constituency. Geographic concentration is the finding.
// Statutory in-position share targets for the central-government reservation
// regime AFTER the 103rd Amendment (Jan 2019). EWS carved 10 percentage
// points from the historical "unreserved" pool; we fold EWS back into GEN
// for time-series continuity, so the GEN target here is the residual after
// SC (15) + ST (7.5) + OBC (27) — i.e. 50.5%. See: Constitution (One Hundred
// and Third Amendment) Act, 2019; Deshpande and Ramachandran 2019.

function renderResources() {
  const host = document.getElementById("resources-tab");

  // Helper: render a single list item the same way for both flat and
  // sub-grouped block schemas. If the item carries an `elig` annotation
  // (citizenship/residency status), surface it as a coloured chip next
  // to the link so the applicant sees the eligibility verdict at a
  // glance — this matters because several Canadian/UK/US programmes
  // exclude Indian-PhD applicants at the door.
  const eligChip = (e) => e
    ? `<span class="elig elig-${escapeAttr(e.status)}">${escapeHTML(e.label)}</span>`
    : "";
  const regionChip = (r) => r
    ? `<span class="region">${escapeHTML(r)}</span>`
    : "";
  const renderItem = (i) => `
    <li>
      ${i.url && i.url !== "#"
        ? `<a href="${escapeAttr(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer">${escapeHTML(i.name)} <span class="ext">↗</span></a>`
        : `<span class="res-name">${escapeHTML(i.name)}</span>`}${regionChip(i.region)}${eligChip(i.elig)}
      <div class="res-note">${escapeHTML(i.note)}</div>
    </li>`;

  // Postdocs-abroad block — sub-grouped, with raw HTML in the intro
  // (controlled, hand-authored — not user input — so the manual <p> and
  // <a> tags are intentional). Renders first because the page's editorial
  // recommendation to Bahujan PhDs is explicitly to apply abroad rather
  // than wait for the Indian state to administer the constitution.
  const postdocBlock = `
    <div class="res-block ${escapeAttr(POSTDOC_ABROAD.cls)}">
      <h3>${escapeHTML(POSTDOC_ABROAD.title)}</h3>
      <div class="res-block-intro">${POSTDOC_ABROAD.intro}</div>
      <div class="elig-legend">
        <span class="leg-label">Eligibility key:</span>
        <span class="elig elig-open">Indian PhDs eligible</span>
        <span class="elig elig-caveat">Open with caveat</span>
        <span class="elig elig-restricted">Restricted</span>
        <span class="elig elig-varies">Varies / verify per call</span>
      </div>
      <div class="elig-legend">
        <span class="leg-label">Region:</span>
        <span class="region">North America</span>
        <span class="region">Europe & UK</span>
        <span class="region">Asia & Oceania</span>
        <span class="region">Multi</span>
      </div>
      <div class="elig-legend" style="background: rgba(180,120,30,0.04); border-color: rgba(180,120,30,0.30); color: var(--ink); align-items: flex-start; line-height: 1.55;">
        <strong style="color: var(--alarm); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;">Regional norms ↘</strong>
        <span style="font-size: 11.5px;">
          <strong>UK / EU / Australia:</strong> PhD must be in hand at the application deadline (some allow a written submission date, but not "expected"). Time-since-PhD limits are common (often 4–8 years).
          <strong style="margin-left: 4px;">US / Canada:</strong> several programmes accept final-year PhDs whose dissertation will be defended before the fellowship start date — verify per call.
          <strong style="margin-left: 4px;">Mobility rules:</strong> Marie Curie (EU) and Newton International (UK) require the applicant not to have resided in the host country for &gt;12 months in the prior 36 — Indian PhDs in India satisfy this by default.
          <strong style="margin-left: 4px;">Letters:</strong> 3 letters of recommendation is the standard; the savarna letter-writing chokepoint is real, plan early.
        </span>
      </div>
      ${POSTDOC_ABROAD.subgroups.map(g => `
        <div class="postdoc-subgroup">
          <h4>${escapeHTML(g.title)}</h4>
          <ul>${g.items.map(renderItem).join("")}</ul>
        </div>`).join("")}
    </div>`;

  // Combined Indian-institutions block — practical-infrastructure
  // links and RTI templates are conceptually the same thing (both
  // serve the candidate applying within India). Rendered as one
  // unified block with two subsections under a single heading.
  const indianBlockData = RESOURCES_BLOCKS[0];
  const indianBlock = `
    <div class="res-block rti-block">
      <h3>If you're applying to Indian institutions</h3>
      <p class="res-block-intro">Practical infrastructure for Indian-institution applications — certificate authorities, parliamentary-question search, the statutory bodies that handle reservation-violation complaints — paired with ready-to-paste RTI templates for the data the institutions don't publish. The two are one toolkit: links above, templates below.</p>
      <h4 class="rti-subhead">Practical infrastructure</h4>
      <ul class="indian-link-list">${indianBlockData.items.map(renderItem).join("")}</ul>
      <h4 class="rti-subhead">RTI templates — when the government won't disclose, you generate the data</h4>
      <p class="rti-subnote">Four ready-to-paste Right to Information Act requests covering the most common institutional opacity patterns. Replace bracketed placeholders, send to the Public Information Officer of the relevant institution. Costs ₹10 per RTI; institutions are obligated to respond within 30 days.</p>
      <div class="rti-grid">
        ${RTI_TEMPLATES.map((t, i) => `
          <details class="rti-card">
            <summary>
              <span class="rti-title">${escapeHTML(t.title)}</span>
              <span class="rti-expand">show template ▾</span>
            </summary>
            <div class="rti-body">
              <p class="rti-scenario">${escapeHTML(t.scenario)}</p>
              <div class="rti-target"><strong>To:</strong> ${escapeHTML(t.target)}</div>
              <textarea class="rti-text" id="rti-text-${i}" readonly rows="14">${escapeHTML(t.body)}</textarea>
              <div class="rti-actions">
                <button class="rti-copy" data-target="rti-text-${i}" type="button">Copy template</button>
                <a class="rti-online" href="https://rtionline.gov.in/" target="_blank" rel="noopener">File on RTI Online ↗</a>
              </div>
            </div>
          </details>`).join("")}
      </div>
    </div>`;

  // Render remaining (non-Indian-applications) blocks after the unified
  // Indian-institutions block.
  const renderBlock = (b) => `
    <div class="res-block">
      <h3>${escapeHTML(b.title)}</h3>
      <ul>${b.items.map(renderItem).join("")}</ul>
    </div>`;
  const remainingBlocks = RESOURCES_BLOCKS.slice(1).map(renderBlock).join("");

  host.innerHTML = `
    <div class="res-intro">
      <h2>Resources for candidates</h2>
      <p>Tools and references for Bahujan PhD scholars navigating the Indian academic job market — and the international fellowship circuit that runs alongside it. The page leads with postdoctoral routes abroad because, on the evidence of the <a href="#vacancies" data-tab-link="vacancies" style="color:var(--accent); font-weight:600;">Vacancies tab</a>, applying within India alone is not a strategy. Indian-institution infrastructure and broader networks follow.</p>
    </div>
    ${postdocBlock}
    ${indianBlock}
    ${remainingBlocks}
  `;

  // Wire copy-to-clipboard for each template.
  host.querySelectorAll(".rti-copy").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ta = host.querySelector(`#${btn.dataset.target}`);
      if (!ta) return;
      try {
        await navigator.clipboard.writeText(ta.value);
        const orig = btn.textContent;
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 1800);
      } catch {
        // Fallback: select the textarea so user can manually copy.
        ta.select();
      }
    });
  });
}

// ---------- saved tab ----------
function renderSaved() {
  const host = document.getElementById("saved-tab");
  const savedAds = ADS.filter(a => SAVED.has(a.id));
  if (savedAds.length === 0) {
    host.innerHTML = `<div class="empty-state"><div class="big">☆</div><div>No saved advertisements yet.</div><div style="font-size:13px; margin-top:4px;">Click the star on any ad to add it to your watchlist.</div></div>`;
    return;
  }
  const sorted = [...savedAds].sort((a,b) => (daysUntil(a.closing_date) ?? 9999) - (daysUntil(b.closing_date) ?? 9999));
  host.innerHTML =
    `<div style="font-size:13px; color:var(--muted); margin-bottom:12px;">${sorted.length} saved advertisement${sorted.length!==1?"s":""}</div>` +
    `<div class="feed-list">${sorted.map(renderAd).join("")}</div>`;
  wireAdActions(host);
}

// ---------- coverage ----------
function renderCoverage() {
  if (!COVERAGE) {
    document.getElementById("coverage-summary").innerHTML = `<p style="color:var(--muted)">No coverage report available yet.</p>`;
    return;
  }
  const s = COVERAGE;
  const ok = (s.rows || []).filter(r => r.fetch_status === "ok").length;
  const stub = (s.rows || []).filter(r => r.fetch_status === "rolling-stub").length;
  const stale = (s.rows || []).filter(r => r.fetch_status === "stale-archive").length;
  const err = (s.rows || []).filter(r => !["ok", "rolling-stub", "stale-archive", "manual"].includes(r.fetch_status)).length;
  document.getElementById("coverage-summary").innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="lbl">Attempted</div><div class="val" style="color:var(--muted)">${s.institutions_attempted}</div></div>
      <div class="kpi"><div class="lbl">Scraped</div><div class="val" style="color:var(--good)">${ok}</div></div>
      <div class="kpi"><div class="lbl">Rolling calls</div><div class="val" style="color:var(--warn)">${stub}</div></div>
      <div class="kpi"><div class="lbl">Carried forward</div><div class="val" style="color:var(--warn)">${stale}</div></div>
      <div class="kpi"><div class="lbl">Needs attention</div><div class="val" style="color:var(--alarm)">${err}</div></div>
      <div class="kpi"><div class="lbl">Total ads</div><div class="val" style="color:var(--accent)">${s.ads_found_total}</div></div>
    </div>
    <p style="font-size:12px; color:var(--muted); margin-bottom:10px;">Run generated at <span style="font-family:var(--mono)">${escapeHTML(s.generated_at)}</span></p>`;
  const tbody = document.querySelector("#coverage-table tbody");
  const statusRank = { "parser-error": 0, "network-error": 1, "http-error": 2, "robots-blocked": 3, "no-url": 4, "stale-archive": 5, "rolling-stub": 6, "manual": 7, "ok": 8 };
  const shown = [...(s.rows || [])].sort((a,b) => (statusRank[a.fetch_status] ?? 4) - (statusRank[b.fetch_status] ?? 4));
  tbody.innerHTML = shown.map(r => {
    const inst = INSTITUTIONS[r.institution_id] || { name: r.institution_id };
    const cls = r.fetch_status === "ok" ? "status-ok" : (r.fetch_status === "manual" || r.fetch_status === "rolling-stub" || r.fetch_status === "stale-archive" || r.fetch_status === "no-url" ? "status-no" : "status-err");
    return `<tr>
      <td>${escapeHTML(inst.name || r.institution_id)}</td>
      <td style="font-family:var(--mono); font-size:12px; color:var(--muted)">${escapeHTML(r.parser)}</td>
      <td class="${cls}">${escapeHTML(r.fetch_status)}</td>
      <td>${r.http_status ?? "—"}</td>
      <td style="text-align:right; font-family:var(--mono)">${r.ads_found}</td>
      <td style="color:var(--muted); font-size:12px;">${escapeHTML(r.note || "")}</td>
    </tr>`;
  }).join("");
}

// ---------- map ----------
let MAP = null;
const MARKERS = {};

function initMap() {
  if (MAP) { MAP.invalidateSize(); return; }
  MAP = L.map("map-container").setView([22.5, 82], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(MAP);

  const typeSeen = new Set();
  for (const inst of Object.values(INSTITUTIONS)) {
    if (!inst.lat || !inst.lon) continue;
    const color = TYPE_COLORS[inst.type] || "#888";
    const marker = L.circleMarker([inst.lat, inst.lon], {
      radius: 7, color, fillColor: color, fillOpacity: 0.85, weight: 1,
    }).addTo(MAP);
    marker._instId = inst.id;
    MARKERS[inst.id] = marker;
    typeSeen.add(inst.type);
  }

  const legend = document.getElementById("map-legend");
  legend.innerHTML = [...typeSeen].filter(Boolean).sort().map(t =>
    `<div class="map-legend-item"><div class="map-legend-dot" style="background:${TYPE_COLORS[t] || '#888'}"></div>${typeLabel(t)}</div>`
  ).join("") +
  `<div class="map-legend-item"><div class="map-legend-dot" style="background:#1F4E79; outline:2px solid var(--warn); outline-offset:1px;"></div>Field-matched ads open</div>`;
}

function updateMapMarkers(filteredAds) {
  if (!MAP) return;
  const fieldCount = {}, totalCount = {};
  for (const ad of filteredAds) {
    const iid = ad.institution_id;
    totalCount[iid] = (totalCount[iid] || 0) + 1;
    if (!fieldTags(ad).includes("Other")) fieldCount[iid] = (fieldCount[iid] || 0) + 1;
  }
  for (const [id, marker] of Object.entries(MARKERS)) {
    const inst = INSTITUTIONS[id];
    const fieldMatched = fieldCount[id] || 0;
    const total = totalCount[id] || 0;
    const color = TYPE_COLORS[inst.type] || "#888";
    if (total === 0) {
      marker.setStyle({ radius: 5, color: "#ccc", fillColor: "#ccc", fillOpacity: 0.3, weight: 1 });
    } else {
      marker.setStyle({
        radius: fieldMatched > 0 ? 10 : 7,
        color: fieldMatched > 0 ? "#b45309" : color,
        fillColor: color, fillOpacity: 0.85,
        weight: fieldMatched > 0 ? 2.5 : 1,
      });
    }
    const coverageUrl = inst.career_page_url_guess || "#";
    const hssLine = fieldMatched > 0 ? `<div class="popup-hss">▲ ${fieldMatched} field-matched ad${fieldMatched > 1 ? "s" : ""}</div>` : "";
    const totalLine = total > 0
      ? `${total} ad${total !== 1 ? "s" : ""} match filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(safeUrl(coverageUrl))}" target="_blank" rel="noopener noreferrer">career page →</a>`
      : `no ads match current filters &nbsp;·&nbsp; <a class="popup-link" href="${escapeAttr(safeUrl(coverageUrl))}" target="_blank" rel="noopener noreferrer">career page →</a>`;
    marker.bindPopup(`
      <strong>${escapeHTML(inst.name)}</strong><br/>
      <span style="color:var(--muted)">${escapeHTML(inst.type)} · ${escapeHTML([inst.city, inst.state].filter(Boolean).join(", "))}</span>
      ${hssLine}
      <div style="margin-top:6px">${totalLine}</div>`);
  }
}

loadData();
