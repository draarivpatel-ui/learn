// Renders the server-built landing pages (/ and /practice, signed out) to bench/next-cta-rendered.json for the GEL `next-cta` guard.
// The guard reads static HTML or a rendered measurement ({ entries: [{ page, html }] }); learn's pages are strings built by
// src/page.js, so this file is the rendered form. `bun scripts/render-next-cta.mjs` rewrites it;
// test/next-cta.test.js fails when it is stale.
import { page } from '../src/page.js';

export const OUT = 'bench/next-cta-rendered.json';
export const render = () => JSON.stringify({
  entries: [['/', 'learn'], ['/practice', 'practice']].map(([path, mode]) => ({ page: path, html: page({ mode }) })),
}, null, 2) + '\n';

if (import.meta.main) {
  await Bun.write(new URL(`../${OUT}`, import.meta.url), render());
  console.log(`wrote ${OUT}`);
}
