// Word search over text sections (BM25). The index is built once, when the content is synced, so a question costs the
// Worker a few lookups and no reading of the docs.
const STOP = new Set('a an and are as at be by can do does for from how i if in is it my of on or that the this to what when where which who why will with you your'.split(' '));
export const words = (text) => (String(text).toLowerCase().match(/[a-z0-9][a-z0-9_.-]*[a-z0-9]|[a-z0-9]/g) || []).flatMap((w) => (w.includes('.') || w.includes('-') || w.includes('_') ? [w, ...w.split(/[._-]+/)] : [w])).filter((w) => w.length > 1 && !STOP.has(w));

// { n, avg, len: [words per section], terms: { word: [section, count, section, count, …] } }
export function buildIndex(texts) {
  const terms = {};
  const len = [];
  texts.forEach((text, i) => {
    const counts = new Map();
    const ws = words(text);
    for (const w of ws) counts.set(w, (counts.get(w) || 0) + 1);
    len.push(ws.length);
    for (const [w, c] of counts) (terms[w] ||= []).push(i, c);
  });
  return { n: texts.length, avg: len.reduce((a, b) => a + b, 0) / (texts.length || 1), len, terms };
}

// The best sections for a question: [{ i, score }], best first. A word that is in most sections counts for little.
export function search(index, question, limit = 6) {
  const scores = new Map();
  const matched = new Map();
  const asked = new Set(words(question));
  for (const w of asked) {
    const list = index.terms[w];
    if (!list) continue;
    const idf = Math.log(1 + (index.n - list.length / 2 + 0.5) / (list.length / 2 + 0.5));
    for (let k = 0; k < list.length; k += 2) {
      const i = list[k], tf = list[k + 1];
      scores.set(i, (scores.get(i) || 0) + (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * index.len[i]) / index.avg)));
      matched.set(i, (matched.get(i) || 0) + 1);
    }
  }
  // A section must hold at least half of the question's words, or one rare word makes any page look like an answer.
  const need = Math.ceil(asked.size / 2);
  return [...scores].filter(([i]) => matched.get(i) >= need).map(([i, score]) => ({ i, score })).sort((a, b) => b.score - a.score).slice(0, limit);
}
