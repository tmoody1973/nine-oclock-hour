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

// readKey is keyed on the deterministic inputs to a read — id, headline, teaser, voice —
// never on the model's nondeterministic output. See lib/reads.ts for why: keying on the
// script meant the cache could essentially never hit.
test('the cache key changes when the headline changes', () => {
  const other: WireItem = { ...item, title: 'A completely different headline' };
  assert.notEqual(readKey(item), readKey(other));
});

test('the cache key changes when the teaser changes', () => {
  const other: WireItem = { ...item, teaser: 'A completely different teaser.' };
  assert.notEqual(readKey(item), readKey(other));
});

test('the cache key changes when the voice changes', () => {
  assert.notEqual(readKey(item, 'Kore'), readKey(item, 'Orus'));
});

test('the same item and voice always produce the same key', () => {
  assert.equal(readKey(item), readKey(item));
});

// The exact lead-in observed live from gemini-2.5-flash on 2026-09-16, despite the prompt
// asking for the script only — a captured failure, not an invented one. Voiced verbatim,
// it would put "Here's your radio read:" on the air.
test('a real observed lead-in is stripped, leaving only the script', () => {
  const raw = "Here's your radio read:\n\nWBEZ reports on Chicago's arts spending. The news examines how this spending compares with other cities. The mayor has made arts investments, and he intends these investments to define his administration. The report addresses the city's arts expenditures and their comparison to other urban areas.";
  assert.equal(
    stripPreamble(raw, 'WBEZ'),
    "WBEZ reports on Chicago's arts spending. The news examines how this spending compares with other cities. The mayor has made arts investments, and he intends these investments to define his administration. The report addresses the city's arts expenditures and their comparison to other urban areas.",
  );
});

test('a script with no lead-in passes through unchanged', () => {
  const raw = 'WBEZ reports on how Chicago\'s arts spending compares with other cities.';
  assert.equal(stripPreamble(raw, 'WBEZ'), raw);
});

test('wrapping quotes are stripped too', () => {
  assert.equal(stripPreamble('"WBEZ reports on the arts budget."', 'WBEZ'), 'WBEZ reports on the arts budget.');
});

// The rights bug: scriptPrompt asks the model to name the source aloud like "WBEZ reports",
// and a plausible way for that to come out is with a colon and a blank line — the exact
// shape stripPreamble otherwise treats as a preamble. Stripping this line would air WBEZ's
// reporting with no credit at all, which is the one thing display-only rights forbid.
test('a lead-in that names the source is credit, not preamble, and must survive', () => {
  const raw = "WBEZ reports:\n\nChicago's arts spending is under review after the mayor's proposal.";
  assert.equal(stripPreamble(raw, 'WBEZ'), raw);
});
