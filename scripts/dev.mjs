// Local run: `bun scripts/dev.mjs` serves the site on http://localhost:8894 with a pretend Fleet and a pretend model,
// so the whole page can be clicked through without a deploy, a key or a real computer.
//   LEARN_DEV_MODEL=off     no written answers (shows the passages)
//   LEARN_DEV_SIGNED_OUT=1  as a visitor who has not signed in
import { handle } from '../src/index.js';

const PORT = Number(process.env.PORT) || 8894;
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// Pretend Fleet: one learner, computers and their files kept in memory. A command "passes" unless it contains "fail".
const fleet = { connections: {}, pods: new Map(), next: 1 };
async function fakeFleet(url, init) {
  const u = new URL(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const [, , kind, id, action] = u.pathname.split('/');
  if (kind === 'connections' && init.method === 'GET') return reply(200, { connections: fleet.connections });
  if (kind === 'connections' && init.method === 'PUT') { fleet.connections[id] = { connected: true }; return reply(200, { ok: true }); }
  if (kind !== 'pods') return reply(404, { error: 'not found' });
  if (!id) {
    const provider = Object.keys(fleet.connections)[0];
    if (!provider) return reply(409, { error: 'connect a provider first' });
    const pod = { id: `dev-${fleet.next++}`, provider, files: new Map() };
    fleet.pods.set(pod.id, pod);
    return reply(200, { id: pod.id, provider });
  }
  const pod = fleet.pods.get(id);
  if (!pod) return reply(404, { error: 'pod not found' });
  if (init.method === 'DELETE') { fleet.pods.delete(id); return reply(200, { ok: true }); }
  if (action === 'run') {
    const typed = /set \+a && \( ([\s\S]*)\n\)$/.exec(body.command)?.[1] ?? body.command;
    const bad = /\bfail\b/.test(typed);
    return reply(200, { exitCode: bad ? 1 : 0, stdout: bad ? '' : `(pretend computer) ran: ${typed}`, stderr: bad ? 'pretend computer: that command failed' : '' });
  }
  if (action === 'files' && init.method === 'PUT') { pod.files.set(body.path, body.content); return reply(200, { ok: true }); }
  if (action === 'files') {
    const path = u.searchParams.get('path');
    return pod.files.has(path) ? reply(200, { content: pod.files.get(path) }) : reply(404, { error: 'no such file' });
  }
  return reply(404, { error: 'not found' });
}

// Pretend model: a short answer that quotes the first passage and cites it.
function fakeModel(init) {
  const prompt = JSON.parse(init.body).messages.at(-1).content;
  const first = /^\[1\] (.*)\n([\s\S]*?)(?:\n\n\[2\] |\n\nQuestion: )/.exec(prompt);
  if (!first) return reply(200, { choices: [{ message: { content: 'NOT COVERED' } }] });
  const lines = first[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('```')).slice(0, 3);
  return reply(200, { choices: [{ message: { content: `From "${first[1]}" (pretend model, local run):\n\n${lines.map((l, i) => `${i + 1}. ${l} [1]`).join('\n')}` } }] });
}

const fetchImpl = async (url, init = {}) => {
  const host = new URL(url).host;
  if (host === 'fleet.local') return fakeFleet(String(url), init);
  if (host === 'inference.local') return fakeModel(init);
  return reply(502, { error: `the local run does not call ${host}` });
};

const counts = new Map();
const cache = { match: async (req) => (counts.has(req.url) ? new Response(counts.get(req.url)) : undefined), put: async (req, res) => { counts.set(req.url, await res.text()); } };

const env = {
  PUBLIC_ORIGIN: `http://localhost:${PORT}`,
  FLEET_URL: 'http://fleet.local',
  FLEET_SERVICE_SECRET: 'local-run-only',
  SESSION_SECRET: 'local-run-only',
  ...(process.env.LEARN_DEV_MODEL === 'off' ? {} : { INFERENCE_URL: 'http://inference.local/v1/chat/completions', INFERENCE_KEY: 'local-run-only' }),
  ...(process.env.LEARN_DEV_SIGNED_OUT ? {} : { DEV_LOGIN: 'dev-learner' }),
};

Bun.serve({
  port: PORT,
  fetch: (request) => handle(request, env, { fetchImpl, cache }).catch((err) => { console.error(err); return reply(500, { error: String(err.message) }); }),
});
console.log(`learn: http://localhost:${PORT}  (pretend Fleet${env.INFERENCE_KEY ? ' and pretend model' : ', model off'}${env.DEV_LOGIN ? `, signed in as ${env.DEV_LOGIN}` : ', signed out'})`);
