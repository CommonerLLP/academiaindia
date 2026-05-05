// docs/lib/search.js — small lexical search normaliser.
//
// Decision for Batch 5: do not ship embedding/semantic search yet. Most
// observed failures are vocabulary/orthography mismatches ("post-doc" vs
// "postdoc", "ML" vs "machine learning", "STS" vs the expanded phrase).
// A token + alias matcher solves that class without client-side embeddings
// or a backend.

const ALIAS_GROUPS = [
  ["postdoc", "post doc", "post-doc", "postdoctoral", "post doctoral", "post-doctoral"],
  ["ml", "machine learning"],
  ["ai", "artificial intelligence"],
  ["sts", "science and technology studies", "science technology studies"],
  ["hss", "humanities and social sciences", "humanities social sciences"],
  ["public policy", "policy studies"],
  ["development studies", "development"],
  ["anthro", "anthropology", "anthropological"],
  ["socio", "sociology", "sociological"],
  ["econ", "economics", "economic sciences"],
  ["mgmt", "management", "business"],
  ["pwd", "pwbd", "persons with benchmark disabilities", "persons with disabilities"],
  ["obc", "other backward classes"],
  ["sc", "scheduled caste", "scheduled castes"],
  ["st", "scheduled tribe", "scheduled tribes"],
  ["ews", "economically weaker section", "economically weaker sections"],
];

const STOPWORDS = new Set(["and", "or", "the", "a", "an", "of", "in", "for", "to", "with"]);

export function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripStopwords(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter(t => t && !STOPWORDS.has(t))
    .join(" ");
}

function phraseInText(phrase, text) {
  if (!phrase) return false;
  const re = new RegExp(`(?:^|\\s)${escapeRegExp(phrase)}(?:\\s|$)`);
  return re.test(text);
}

function matchingAliasGroups(value) {
  const base = normalizeSearchText(value);
  const compact = stripStopwords(value);
  if (!base) return [];
  const matches = [];
  for (const group of ALIAS_GROUPS) {
    const variants = group.map(normalizeSearchText);
    const compactVariants = group.map(stripStopwords);
    if (
      variants.some(v => phraseInText(v, base))
      || compactVariants.some(v => phraseInText(v, compact))
    ) {
      matches.push({ variants, compactVariants });
    }
  }
  return matches;
}

export function expandSearchAliases(value) {
  const base = normalizeSearchText(value);
  if (!base) return "";
  const additions = matchingAliasGroups(value).flatMap(g => g.variants);
  return normalizeSearchText([base, ...additions].join(" "));
}

export function queryTokens(query) {
  return normalizeSearchText(query).split(/\s+/).filter(t => t && !STOPWORDS.has(t));
}

export function matchesSearch(haystack, query) {
  const normalizedHaystack = normalizeSearchText(haystack);
  const compactHaystack = stripStopwords(haystack);
  const aliasGroups = matchingAliasGroups(query);
  let tokenText = normalizeSearchText(query);

  for (const group of aliasGroups) {
    const matched = group.variants.some(v => phraseInText(v, normalizedHaystack))
      || group.compactVariants.some(v => phraseInText(v, compactHaystack));
    if (!matched) return false;
    for (const variant of group.variants) {
      tokenText = tokenText.replace(new RegExp(`(?:^|\\s)${escapeRegExp(variant)}(?:\\s|$)`, "g"), " ");
    }
  }

  const terms = stripStopwords(tokenText).split(/\s+/).filter(Boolean);
  if (!aliasGroups.length && !terms.length) return true;
  const tokenSet = new Set(normalizedHaystack.split(/\s+/).filter(Boolean));
  return terms.every(term => {
    if (term.length <= 2) return tokenSet.has(term);
    return normalizedHaystack.includes(term);
  });
}
