// Learn: an answer to a question from the Flisk docs, with the pages it came from. The docs are searched here, in the
// Worker; a model (Flisk Wolf on inference.flisk.si) only writes the answer from the passages found, and when it is
// off or over today's budget the learner still gets the passages.
import docs from './data/docs.json';
import { search } from './search.js';

export const DOCS_SOURCE = docs.source;
export const MAX_QUESTION = 400;
const DOCS_URL = 'https://github.com/flisk-sh/flisk/blob/main/docs/';

export function passagesFor(question, limit = 6) {
  const seen = new Set();
  const out = [];
  for (const hit of search(docs.index, question, limit * 3)) {
    const s = docs.sections[hit.i];
    if (hit.score < 3 || seen.has(`${s.p}#${s.a}`)) continue;
    seen.add(`${s.p}#${s.a}`);
    out.push({ n: out.length + 1, title: s.t, heading: s.h, url: `${DOCS_URL}${s.p}${s.a ? `#${s.a}` : ''}`, text: s.x });
    if (out.length === limit) break;
  }
  return out;
}

const SYSTEM =
  'You teach Flisk, a tool that runs an app\'s services on a developer\'s own machine. Answer the question using only the numbered passages from the Flisk docs. ' +
  'Write short numbered steps or two to five plain sentences. Put every command on its own line in a ``` block, copied exactly from a passage. ' +
  'After each claim cite its passage as [n]. Give the part of the answer the passages contain. If they contain none of it, reply with exactly: NOT COVERED';

export const answerMessages = (question, passages) => [
  { role: 'system', content: SYSTEM },
  { role: 'user', content: `${passages.map((p) => `[${p.n}] ${p.title}${p.heading ? ` › ${p.heading}` : ''}\n${p.text}`).join('\n\n')}\n\nQuestion: ${question}` },
];

// Drop every line that names a flisk command the passages do not contain: a learner will paste what we print.
export function finishAnswer(reply, passages) {
  const text = String(reply || '').trim();
  if (!text || /^NOT COVERED\b/i.test(text)) return { text: null, dropped: 0 };
  const known = passages.map((p) => p.text).join('\n');
  let dropped = 0;
  const kept = text.split('\n').filter((line) => {
    const cmds = line.match(/\bflisk [a-z][a-z-]+/g) || [];
    if (cmds.every((c) => known.includes(c))) return true;
    dropped += 1;
    return false;
  });
  const out = kept.join('\n').replace(/```[a-z]*\n\s*```/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text: out.replace(/\[\d+\]/g, '').trim().length > 20 ? out : null, dropped };
}

// The model's reply text, or throws. Inside Cloudflare the call goes over the INFERENCE service binding: a Worker
// cannot reach another Worker on the same domain by its public address.
export async function askModel(env, messages, fetchImpl = fetch) {
  const url = env.INFERENCE_URL || 'https://inference.flisk.si/v1/chat/completions';
  const init = {
    method: 'POST',
    headers: { authorization: `Bearer ${env.INFERENCE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.INFERENCE_MODEL || 'flisk-wolf-chat', messages, max_tokens: 500, temperature: 0.2 }),
    signal: AbortSignal.timeout(25_000),
  };
  const res = await (env.INFERENCE ? env.INFERENCE.fetch(url, init) : fetchImpl(url, init));
  if (!res.ok) throw new Error(`the model answered ${res.status}`);
  const text = (await res.json())?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('the model sent no text');
  return text;
}

// A counter per day in a Cache-API-shaped store: true while `key` has been taken fewer than `limit` times today.
// Cloudflare's cache is per data centre, so the cap is close, not exact; the hard budget is on inference.flisk.si.
export async function takeToday(cache, key, limit, now = Date.now()) {
  if (!cache) return true;
  const day = new Date(now).toISOString().slice(0, 10);
  const req = new Request(`https://learn.invalid/count/${key}/${day}`);
  const used = Number(await (await cache.match(req))?.text()) || 0;
  if (used >= limit) return false;
  await cache.put(req, new Response(String(used + 1), { headers: { 'cache-control': 'max-age=90000' } }));
  return true;
}
