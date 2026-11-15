import data from './data/labs.json';
import { buildIndex, search } from './search.js';

export const COURSES = data.courses;
export const PARTS = data.parts;
export const LABS_SOURCE = data.source;
export const labById = (id) => (Object.hasOwn(data.labs, String(id)) ? data.labs[id] : null);
export const stepOf = (lab, stepId) => lab?.steps.find((s) => s.id === stepId) || null;

// What the lab list shows for each lab; the steps load with the lab's own page.
export const LAB_CARDS = Object.values(data.labs).map((l) => ({ id: l.id, title: l.title, level: l.level, minutes: l.minutes, goal: l.goal, steps: l.steps.map((s) => s.id) }));

const ids = Object.keys(data.labs);
const index = buildIndex(ids.map((id) => { const l = data.labs[id]; return `${l.title} ${l.title} ${l.goal} ${l.build} ${l.steps.map((s) => s.task).join(' ')}`; }));
// Labs that practise what a question is about, best first.
export const labsFor = (question, limit = 2) => search(index, question, limit).filter((h) => h.score > 2).map((h) => { const l = data.labs[ids[h.i]]; return { id: l.id, title: l.title, minutes: l.minutes }; });

// Every lab works in its own folder on the computer, so two labs never see each other's files.
export const labDir = (lab) => `labs/${lab.id}`;
// Each command is a new shell on the computer, so what a learner exports is gone by the next one. A .env file in the
// lab's folder is loaded before every command instead: that is where a lab's keys and settings go.
export const inLabDir = (lab, command) => `mkdir -p ${labDir(lab)} && cd ${labDir(lab)} && set -a && { [ ! -f .env ] || . ./.env; } && set +a && ( ${command}\n)`;
// A file a learner may open or save: a plain relative path inside the lab's folder.
export const safeFile = (path) => (/^[A-Za-z0-9_][A-Za-z0-9_./-]{0,120}$/.test(String(path)) && !String(path).split('/').some((p) => p === '..' || p === '') ? String(path) : null);
