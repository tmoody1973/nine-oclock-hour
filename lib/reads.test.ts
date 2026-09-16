import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptPrompt, readKey, stripPreamble, voiceRead } from './reads';
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

// scriptPrompt bakes `item.src` into the words the model is asked to say ("WBEZ reports").
// Two items sharing an id, headline and teaser but differing only in src must not collide
// on one key — the first voiced would win, and the second would air with the wrong source
// named aloud.
test('the cache key changes when the source changes, even with everything else identical', () => {
  const other: WireItem = { ...item, src: 'A Different Newsroom' };
  assert.notEqual(readKey(item), readKey(other));
});

test('the same item and voice always produce the same key', () => {
  assert.equal(readKey(item), readKey(item));
});

// A cache hit must cost zero API calls, not one — the property Important 3 exists to
// protect. Proved with a seam (voiceRead's third `blob` parameter, defaulting to the real
// @vercel/blob functions — see lib/reads.ts) rather than mocking the @vercel/blob module:
// no experimental Node flag, no change to the project's test command, and a fetch spy
// throws if a script or TTS call is ever attempted, so this fails loudly rather than
// quietly passing on luck.
test('a cache hit skips the script call and the TTS call entirely', async () => {
  const fakeUrl = 'https://blob.example/reads/already-cached.wav';
  let headCalls = 0;
  const blob = {
    head: async () => { headCalls++; return { url: fakeUrl }; },
    put: async () => { throw new Error('put should never run on a cache hit'); },
  };
  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error('no network call should happen on a cache hit');
  }) as unknown as typeof fetch;
  try {
    const url = await voiceRead(item, 'Kore', blob);
    assert.equal(url, fakeUrl);
    assert.equal(headCalls, 1);
    assert.equal(fetchCalls, 0, 'a cache hit must make zero script or TTS calls');
  } finally {
    globalThis.fetch = realFetch;
  }
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
