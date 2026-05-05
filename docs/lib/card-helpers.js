// docs/lib/card-helpers.js — pure helpers used by the card-render path.
//
// Includes: ad-content classifiers (isAsstProfMatch / isResearchMatch /
// etc.), date utilities (parseDate / daysUntil / urgencyTier), recruiting-
// unit normalisation (normalizeRecruitingUnitName / cardDiscipline),
// rank-line composition (cardRankLine), structured + free-text cue
// extractors (extractCardCues, structuredCues, summarize* helpers), and
// the ad → display-string formatters (sourceLabel, contractLabel).
//
// External dependencies are confined to lib/state.js (INSTITUTIONS),
// lib/classify.js (rank helpers + getStructuredPosition), and lib/
// sanitize.js (URL helpers). Everything else is pure or self-contained.

import { state } from "./state.js";
import { abbreviateRank, condenseRanks, getStructuredPosition } from "./classify.js";
import { safeUrl, resolveUrl, escapeRegExp } from "./sanitize.js";

/** Type-to-colour map used by the card type chip and the map markers. */
export const TYPE_COLORS = {
  IIT: "#1F4E79", IIM: "#2d6a4f", IISc: "#6b21a8", IISER: "#b45309",
  NIT: "#64748b", IIIT: "#0e7490", CentralUniversity: "#92400e",
  PrivateUniversity: "#7c3aed",
};

export function detectAdCampus(ad) {
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

export function cityAlreadyInInstitutionName(instName, city) {
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

export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(d); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86400000);
}

export function urgencyTier(ad) {
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

export function formatDate(s) {
  const d = parseDate(s);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatCountdown(ad) {
  const d = daysUntil(ad.closing_date);
  if (d == null) return "";
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  if (d === 1) return "1 day left";
  return `in ${d} days`;
}

export function daysSince(s) {
  const d = parseDate(s);
  if (!d) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const seen = new Date(d); seen.setHours(0,0,0,0);
  return Math.max(0, Math.round((today - seen) / 86400000));
}

export function sourceLabel(ad) {
  if (ad._source_method === "public-interest override") return "official source";
  if (ad._source_method === "stale carry-forward") return "carried forward";
  if (ad._source_method === "curated rolling call" || ad._rolling_stub || ad._manual_stub) return "rolling call";
  if (ad._curated_iit || ad._pdf_parsed) return "verified PDF";
  if (ad._source_method === "official scrape") return "parsed page";
  return "parsed source";
}

export function sourceLinkLabel(ad) {
  if (ad._rolling_stub || ad._manual_stub) return "Official source →";
  if (ad._pdf_parsed || (ad.original_url || "").toLowerCase().includes(".pdf")) return "Original PDF →";
  return "Official listing →";
}

// ---------- position-type helpers ----------
// Four mutually-non-exclusive predicates. An ad can match multiple — many
// IIT rolling ads cover Asst/Assoc/Full simultaneously, in which case all
// three checkboxes light up for that ad. We err on inclusive matching so a
// user looking for "Associate Professor" doesn't miss generic faculty ads.
export function _t(ad) {
  const sp = getStructuredPosition(ad);
  return [ad.title, sp?.post_type, ...(sp?.ranks || [])].filter(Boolean).join(" ").toLowerCase();
}
export function isAsstProfMatch(ad) {
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
export function isAssocProfMatch(ad) {
  const sp = getStructuredPosition(ad);
  const ranks = Array.isArray(sp?.ranks) ? sp.ranks.map(r => String(r).toLowerCase()) : [];
  if (ranks.some(r => /\bassociate\s+professor\b/.test(r))) return true;
  const t = _t(ad);
  if (/\bassociate\s+professor\b/.test(t)) return true;
  if (/assoc(iate)?\s*[\/]/i.test(ad.title || "")) return true;  // "Asst/Assoc/Prof"
  return false;
}
export function isFullProfMatch(ad) {
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
export function isResearchMatch(ad) {
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
export function isVisitingMatch(ad) {
  const sp = getStructuredPosition(ad);
  if (ad.post_type === "Visiting") return true;
  if (sp?.post_type === "Visiting" || sp?.contract_status === "Visiting") return true;
  return /\bvisiting\s+(faculty|professor|fellow|scholar|lecturer)\b/.test(_t(ad));
}
// Backwards-compatible alias used by quick-chip handlers and any older code.
export const isFacultyMatch = isAsstProfMatch;

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

export function contractLabel(cs) {
  // Map ContractStatus enum → Indian academic vocabulary.
  if (cs === "Regular" || cs === "TenureTrack" || cs === "Permanent") return "Permanent";
  if (cs === "Contractual" || cs === "Contract") return "Contract";
  if (cs === "Guest" || cs === "Visiting") return "Visiting";
  return null; // Unknown → omit the line entirely
}


export const DEPARTMENT_UNIT_OVERRIDES = new Map([
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

export function normalizeRecruitingUnitName(unit, ad = {}) {
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
  const instType = String((state.INSTITUTIONS[instId] || {}).type || "");
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

export function normalizeDisciplineName(discipline) {
  return String(discipline || "")
    .replace(/\bInterdisciplina\s+ry\b/gi, "Interdisciplinary")
    .replace(/\s+(?:has|is|offers|provides)\b[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferRecruitingUnitFromText(ad = {}) {
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

export function titleFieldLabel(title) {
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
export function cardDiscipline(ad) {
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
export function canonicalAreaLabel(s) {
  return String(s || "")
    .replace(/\bHealth innovations?\s*(?:&|and)\s*systems?\b/i, "Health Innovations")
    .replace(/\bInnovation Systems?\s*(?:&|and)\s*Processes\b/i, "Innovation Systems")
    .replace(/\bInternet,\s*Digital Information\s*(?:&|and)\s*Society\b/i, "Digital Information & Society")
    .replace(/\bTechnical Higher Education\b/i, "Technical Higher Education")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanNumberedCueItem(s) {
  return canonicalAreaLabel(String(s || "")
    .replace(/Page\s+\d+\s+of\s+\d+/gi, " ")
    .replace(/\([^)]*ver\.[^)]*\)/gi, " ")
    .replace(/\s*[–-]\s+(?:Potential|Maximum age|At least|First class|Publications?|Academic Background|Teaching|Other)\b[\s\S]*$/i, "")
    .replace(/\s+\b(?:those with professional experience|physical disability|may also be relaxed|candidates?\s+\(|First class|Potential for|Maximum age|At least)\b[\s\S]*$/i, "")
    .replace(/[.;:,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

export function extractNumberedCueItems(text) {
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

export function summarizeEligibilityCue(text, ad = {}) {
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

export function summarizeEvaluationCue(text, ad = {}) {
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

export function structuredEligibilityCue(pos) {
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

export function structuredEvaluationCue(pos) {
  if (!pos) return null;
  const q = pos.qualifications || {};
  const bits = [];
  if (q.publications_required) bits.push(`Publications: ${q.publications_required}`);
  if (q.teaching_experience) bits.push(`Teaching: ${q.teaching_experience}`);
  return bits.length ? bits.slice(0, 2).join("; ") : null;
}

export function structuredCues(ad = {}) {
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

export function extractCardCues(text, ad = {}) {
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

export function cardRankLine(ad) {
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
