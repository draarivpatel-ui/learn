// The one most likely next action on a landing page (the hero "Start free with GitHub" button) is marked for the GEL next-cta guard.
import { expect, test } from 'bun:test';
import { page } from '../src/page.js';
import { render, OUT } from '../scripts/render-next-cta.mjs';

const landing = [['/', () => page({ mode: 'learn' })], ['/practice', () => page({ mode: 'practice' })]];

for (const [path, html] of landing) {
  test(`${path}: exactly one data-next-cta, the first link/button after the h1, with class next-cta`, () => {
    const body = html();
    expect(body.match(/data-next-cta/g)).toHaveLength(1);
    const after = body.slice(body.indexOf('</h1>'));
    const first = /<(a|button|input)\b[^>]*>/i.exec(after)[0];
    expect(first).toContain('data-next-cta');
    expect(first).toMatch(/class="[^"]*\bbtn\b[^"]*\bnext-cta\b[^"]*"/);
    expect(after).toContain('Start free with GitHub');
  });
}

test('signed-in pages mark nothing (no hero button)', () => {
  expect(page({ mode: 'learn', login: 'ada' })).not.toContain('data-next-cta');
});

test('the stylesheet spins .next-cta and has a prefers-reduced-motion fallback', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(page({ mode: 'learn' }))[1];
  expect(css).toMatch(/\.next-cta\{[^}]*animation:next-cta-spin 3s linear infinite/);
  expect(css).toContain('@keyframes next-cta-spin');
  expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.next-cta\{animation:none/);
});

test('bench/next-cta-rendered.json is up to date (run: bun scripts/render-next-cta.mjs)', async () => {
  const file = Bun.file(new URL(`../${OUT}`, import.meta.url));
  expect(await file.exists()).toBe(true);
  expect(await file.text()).toBe(render());
});
