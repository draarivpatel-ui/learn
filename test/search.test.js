import { expect, test } from 'bun:test';
import { buildIndex, search } from '../src/search.js';

test('indexes constructor as a normal search term across a JSON round trip', () => {
  const index = JSON.parse(JSON.stringify(buildIndex([
    'Initialize the constructor before creating a service.',
    'Run migrations before deploying a service.',
  ])));
  expect(search(index, 'constructor').map(({ i }) => i)).toEqual([0]);
});

test('does not search inherited properties absent from the index', () => {
  const index = JSON.parse(JSON.stringify(buildIndex(['Start a service.'])));
  expect(search(index, 'constructor')).toEqual([]);
});
