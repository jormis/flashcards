// Partial, typo-tolerant search across the French, English and Finnish fields of WORDS

function normalize(s) {
  return s.toLowerCase()
    .replace(/œ/g, "oe").replace(/æ/g, "ae")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // é -> e, ä -> a
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Split "always; still" or "hi, bye" into alternatives so each can match exactly
function alternatives(text) {
  return text.split(/[;,/]/).map(normalize).filter(Boolean).map((t) => ({
    text: t,
    words: t.split(" "),
    compact: t.replace(/ /g, ""), // lets "jai" find "j'ai"
  }));
}

function indexEntry(w) {
  return { fr: alternatives(w.fr), en: alternatives(w.en), fi: alternatives(w.fi) };
}

// Kept in step with WORDS: push indexEntry(word) whenever a card is added
const SEARCH_INDEX = WORDS.map(indexEntry);

// Optimal string alignment distance (typos incl. swapped letters), giving up above max
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

// Exact > whole words > start of text > start of a word > joined words > anywhere inside a word
function matchScore(q, alt) {
  const padded = ` ${alt.text} `;
  if (alt.text === q) return 100;
  if (padded.includes(` ${q} `)) return 90;
  if (alt.text.startsWith(q)) return 80;
  if (padded.includes(` ${q}`)) return 70;
  if (q.length > 2 && alt.compact.startsWith(q.replace(/ /g, ""))) return 65;
  if (alt.text.includes(q)) return 45;
  return 0;
}

function termScore(term, alt) {
  const exact = matchScore(term, alt);
  if (exact) return exact;
  // Typo tolerance grows with query length; short queries must match exactly
  const max = term.length < 4 ? 0 : term.length < 7 ? 1 : 2;
  if (!max) return 0;
  let best = max + 1;
  for (const w of alt.words) {
    // Compare with the whole word and with its start, so half-typed words with a typo still match
    best = Math.min(best, editDistance(term, w, max), editDistance(term, w.slice(0, term.length), max));
  }
  return best <= max ? 40 - best * 10 : 0;
}

function altScore(query, terms, alt) {
  const whole = matchScore(query, alt);
  if (whole >= 65) return whole;
  // Otherwise every query word must match somewhere in this alternative, possibly with typos
  let total = 0;
  for (const term of terms) {
    const s = termScore(term, alt);
    if (!s) return whole;
    total += s;
  }
  return Math.max(whole, (total / terms.length) * 0.9);
}

function searchWords(rawQuery, limit = 10) {
  const query = normalize(rawQuery);
  if (!query) return [];
  const terms = query.split(" ");
  const results = [];
  SEARCH_INDEX.forEach((entry, index) => {
    let best = { score: 0, lang: null };
    for (const lang of ["fr", "en", "fi"]) {
      for (const alt of entry[lang]) {
        const score = altScore(query, terms, alt) + (lang === "fr" ? 1 : 0); // French wins ties
        if (score > best.score) best = { score, lang };
      }
    }
    if (best.score > 1) results.push({ index, ...best });
  });
  results.sort((a, b) => b.score - a.score || WORDS[a.index].fr.length - WORDS[b.index].fr.length);
  return results.slice(0, limit);
}
