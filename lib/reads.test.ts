import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptPrompt, readKey, stripPreamble } from './reads';
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

// The exact lead-in observed live from gemini-2.5-flash on 2026-09-16, despite the prompt
// asking for the script only — a captured failure, not an invented one. Voiced verbatim,
// it would put "Here's your radio read:" on the air.
test('a real observed lead-in is stripped, leaving only the script', () => {
  const raw = "Here's your radio read:\n\nWBEZ reports on Chicago's arts spending. The news examines how this spending compares with other cities. The mayor has made arts investments, and he intends these investments to define his administration. The report addresses the city's arts expenditures and their comparison to other urban areas.";
  assert.equal(
    stripPreamble(raw),
    "WBEZ reports on Chicago's arts spending. The news examines how this spending compares with other cities. The mayor has made arts investments, and he intends these investments to define his administration. The report addresses the city's arts expenditures and their comparison to other urban areas.",
  );
});

test('a script with no lead-in passes through unchanged', () => {
  const raw = 'WBEZ reports on how Chicago\'s arts spending compares with other cities.';
  assert.equal(stripPreamble(raw), raw);
});

test('wrapping quotes are stripped too', () => {
  assert.equal(stripPreamble('"WBEZ reports on the arts budget."'), 'WBEZ reports on the arts budget.');
});
