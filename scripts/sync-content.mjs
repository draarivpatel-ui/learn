// Build what the site teaches from, as two JSON files the Worker carries with it:
//   src/data/labs.json  the courses and labs of flisk-sh/flisk-labs (practice.flisk.si)
//   src/data/docs.json  the Flisk docs (flisk-sh/flisk, docs/) cut into sections, with a word index for search
// Run: bun scripts/sync-content.mjs <flisk checkout> <flisk-labs checkout>
// It reads `git show <ref>:<file>` (default ref origin/main), so the checkouts' working trees are never used.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { buildIndex } from '../src/search.js';

const [flisk, labsRepo] = process.argv.slice(2);
if (!flisk || !labsRepo) throw new Error('usage: bun scripts/sync-content.mjs <flisk checkout> <flisk-labs checkout>');
const REF = process.env.REF || 'origin/main';
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
const files = (dir, path) => git(dir, 'ls-tree', '-r', '--name-only', REF, path).split('\n').filter(Boolean);
const show = (dir, path) => git(dir, 'show', `${REF}:${path}`);
const commit = (dir) => git(dir, 'rev-parse', '--short', REF).trim();

// ---- labs
const tracks = Bun.YAML.parse(show(labsRepo, '_data/tracks.yml'));
const COURSES = { ai: 'AI engineering', flisk: 'Flisk CLI' };
const labs = {};
for (const file of files(labsRepo, 'content/labs').filter((f) => f.endsWith('.yaml'))) {
  const lab = Bun.YAML.parse(show(labsRepo, file));
  if (!lab?.id || !Array.isArray(lab.steps)) continue;
  labs[lab.id] = {
    id: lab.id, title: lab.title, level: lab.level, minutes: lab.duration_min, goal: lab.goal, build: lab.build || '',
    needs: lab.needs || [], docs: lab.docs || [],
    steps: lab.steps.map((s) => ({ id: s.id, task: s.task, explain: s.explain || '', cmd: s.cmd || '', expect: s.expect || '', files: s.files || [] })),
  };
}
const parts = tracks.filter((t) => (t.labs || []).some((id) => labs[id])).map((t) => ({ id: t.id, course: t.course || 'flisk', title: t.title, description: t.description || '', labs: t.labs.filter((id) => labs[id]) }));
const courses = [...new Set(parts.map((p) => p.course))].map((id) => ({ id, title: COURSES[id] || id }));
writeFileSync(new URL('../src/data/labs.json', import.meta.url), `${JSON.stringify({ source: `flisk-sh/flisk-labs@${commit(labsRepo)}`, courses, parts, labs })}\n`);

// ---- docs: the pages a user of Flisk reads. Translations, the changelog and internal notes stay out.
const KEEP_DIRS = ['101', 'start', 'reference', 'agents', 'recipes', 'project', 'install', 'setup', 'examples', 'agent-tooling', 'compare'];
const SKIP_TOP = /^(README-|CHANGELOG|ROADMAP|REFACTORING|ACCESS-CONTINUITY|adoption-plan|strategy-|faq-teams)/;
const wanted = (f) => {
  const rel = f.slice('docs/'.length).split('/');
  return f.endsWith('.md') && (rel.length === 1 ? !SKIP_TOP.test(rel[0]) : KEEP_DIRS.includes(rel[0]));
};
const anchor = (h) => h.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
const plain = (md) => md.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\n{3,}/g, '\n\n').trim();
const MAX = 1400;
const sections = [];
for (const file of files(flisk, 'docs').filter(wanted)) {
  const lines = show(flisk, file).replace(/^---\n[\s\S]*?\n---\n/, '').split('\n');
  let title = '', heading = '', buf = [], fence = false;
  const flush = () => {
    const text = plain(buf.join('\n'));
    if (text.length >= 60) sections.push({ p: file.slice('docs/'.length), t: title || file, h: heading, a: heading ? anchor(heading) : '', x: text.slice(0, MAX) });
    buf = [];
  };
  for (const line of lines) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,3})\s+(.+?)\s*#*$/.exec(line);
    if (!m) { buf.push(line); continue; }
    flush();
    const text = m[2].replace(/[`*_]/g, '');
    if (m[1] === '#' && !title) { title = text; heading = ''; } else heading = text;
  }
  flush();
}
const index = buildIndex(sections.map((s) => `${s.t} ${s.t} ${s.h} ${s.h} ${s.h} ${s.x}`));
writeFileSync(new URL('../src/data/docs.json', import.meta.url), `${JSON.stringify({ source: `flisk-sh/flisk@${commit(flisk)}`, sections, index })}\n`);
console.log(`labs: ${Object.keys(labs).length} in ${parts.length} parts · docs: ${sections.length} sections, ${Object.keys(index.terms).length} words`);
