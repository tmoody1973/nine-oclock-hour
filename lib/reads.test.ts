import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptPrompt, readKey } from './reads';
import type { WireItem } from './types';

const item: WireItem = { id: 'g-s308-6913', src: 'WBEZ', how: 'station', kind: 'seg',
  title: "How Chicago's arts spending compares with other cities", teaser: 'The mayor wants his arts investments to define the administration.',
  url: 'https://www.wbez.org', topic: 'local', when: '2026-09-16', len: 0 };

test('the script prompt asks for our own words, with the source named aloud', () => {
  const p = scriptPrompt(item);
  assert.match(p, /own words/i);
  assert.match(p, /WBEZ/);
  assert.match(p, /55 words|about 30 seconds/i);
  assert.ok(!p.includes('verbatim'));
});

test('the cache key changes when the script changes', () => {
  assert.notEqual(readKey(item, 'first script'), readKey(item, 'second script'));
  assert.equal(readKey(item, 'same'), readKey(item, 'same'));
});
