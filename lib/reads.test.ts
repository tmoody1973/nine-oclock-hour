import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptPrompt, readKey, stripPreamble, voiceRead, legalIdKey, voiceId, voiceWeather, TTS_MODEL, SCRIPT_MODEL } from './reads';
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

// ─── The legal ID ─────────────────────────────────────────────────────────────────────────
// Recorded with speak() — text to speech and nothing else. voiceRead() above sends an item to
// the script model FIRST and records whatever it writes, which is right for a news read and
// catastrophic for a legal identification: an AI paraphrasing a station's licence wording is
// the single worst outcome available here. These tests pin that separation.

const ID_TEXT = "You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee";

// Keyed on the TEXT, never on the date. The wording almost never changes, so the same words in
// the same voice must land on the same stored object every morning — recorded once, then free
// on every run after. A date in the key would buy a fresh recording of identical words daily.
test('the legal ID key is the same every day for the same words and voice', () => {
  assert.equal(legalIdKey(ID_TEXT, 'Orus'), legalIdKey(ID_TEXT, 'Orus'));
});

test('changing a single character of the wording earns a new recording', () => {
  assert.notEqual(legalIdKey(ID_TEXT, 'Orus'), legalIdKey(`${ID_TEXT}.`, 'Orus'));
});

test('the same words in a different voice are a different recording', () => {
  assert.notEqual(legalIdKey(ID_TEXT, 'Orus'), legalIdKey(ID_TEXT, 'Kore'));
});

// THE TRAP THE ids/ PREFIX EXISTS FOR. sweepReads deletes anything under reads/ older than
// three days unless a stored day file still references it — and the referenced set is built by
// audioUrls(), which reads only `audio`/`spokenAudio` on WIRE ITEMS. A legal ID is referenced
// from a STATION record, so nothing would ever name it: stored under reads/ it would look
// unreferenced, age out, and be deleted, and the hour would go back to opening on sixty seconds
// of silence days later with nothing to show what broke. It is also simply true that a legal ID
// is permanent rather than a daily read. Matching guard in lib/store.test.ts.
test('a legal ID is stored under ids/, never reads/, so the three-day sweep can never reach it', () => {
  assert.ok(legalIdKey(ID_TEXT, 'Orus').startsWith('ids/'), 'anything under reads/ is swept at three days');
});

test('a cached legal ID costs no API call at all — recorded once, free every morning after', async () => {
  const fakeUrl = 'https://blob.example/ids/already-recorded.wav';
  let headCalls = 0;
  const blob = {
    head: async () => { headCalls++; return { url: fakeUrl }; },
    put: async () => { throw new Error('put must never run on a cache hit'); },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('no network call should happen on a cache hit'); }) as unknown as typeof fetch;
  try {
    assert.equal(await voiceId(ID_TEXT, 'Orus', blob), fakeUrl);
    assert.equal(headCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// THE ONE THAT PROVES IT IS NOT A READ. Two claims in one: exactly ONE model call happens (so
// the script model is never consulted), and the bytes handed to text-to-speech are the station's
// words unchanged. If anyone ever routes a legal ID through voiceRead() for tidiness, this goes
// red on both counts at once.
test('a legal ID is spoken verbatim — one TTS call, and the script model never sees it', async () => {
  const urls: string[] = [];
  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: { body: string }) => {
    urls.push(String(url));
    bodies.push(String(init.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('fake pcm').toString('base64') } }] } }] }) };
  }) as unknown as typeof fetch;
  const blob = {
    head: async () => { throw new Error('not recorded yet'); },
    put: async (key: string) => ({ url: `https://blob.example/${key}` }),
  };
  try {
    const url = await voiceId(ID_TEXT, 'Orus', blob);
    assert.equal(urls.length, 1, 'exactly one model call, and it is the TTS one');
    assert.ok(urls[0].includes(TTS_MODEL), 'text to speech');
    assert.ok(!urls[0].includes(SCRIPT_MODEL), 'never the model that writes its own words');
    assert.equal(JSON.parse(bodies[0]).contents[0].parts[0].text, ID_TEXT, 'the words go to TTS exactly as the station gave them');
    assert.ok(url.startsWith('https://blob.example/ids/'), 'and it is stored where the sweep cannot reach it');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ── The weather window ────────────────────────────────────────────────────────────────────
// Same path as the legal ID and for the same reason: these words must reach text-to-speech
// unchanged. A legal ID rewritten by a model is a licence violation; a forecast rewritten by
// a model is a forecast that is wrong, aired to somebody looking out of the window. voiceId
// and voiceWeather are now two keys onto one recorder (voiceVerbatim) so the two can never
// drift apart on that guarantee.
const WX_TEXT = 'The forecast for Milwaukee, from the National Weather Service. Thursday. Mostly cloudy, with a high near 71.';

test('a forecast is spoken verbatim, and stored where the reads sweep cannot reach it', async () => {
  const urls: string[] = [];
  const bodies: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init: { body: string }) => {
    urls.push(String(url));
    bodies.push(String(init.body));
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('fake pcm').toString('base64') } }] } }] }) };
  }) as unknown as typeof fetch;
  const blob = {
    head: async () => { throw new Error('not recorded yet'); },
    put: async (key: string) => ({ url: `https://blob.example/${key}` }),
  };
  try {
    const url = await voiceWeather('2026-09-17', 's921', WX_TEXT, 'Orus', blob);
    assert.equal(urls.length, 1, 'exactly one model call, and it is the TTS one');
    assert.ok(urls[0].includes(TTS_MODEL));
    assert.ok(!urls[0].includes(SCRIPT_MODEL), 'no model ever rewrites a forecast');
    assert.equal(JSON.parse(bodies[0]).contents[0].parts[0].text, WX_TEXT, 'the words go to TTS exactly as composed');
    assert.ok(url.startsWith('https://blob.example/wx/2026-09-17-s921-'), 'under wx/, not reads/ — see weatherKey');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// A re-run of the same morning finds the same forecast, composes the same words, and pays
// nothing. A forecast the service has REVISED since earns a different key and a new recording
// — which is the point of keying on the words, not on the date alone.
test('re-running a morning whose forecast has not changed costs no API call', async () => {
  const fakeUrl = 'https://blob.example/wx/2026-09-17-s921-abc123abc123.wav';
  let headCalls = 0;
  const blob = {
    head: async () => { headCalls++; return { url: fakeUrl }; },
    put: async () => { throw new Error('put must never run on a cache hit'); },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('no network call should happen on a cache hit'); }) as unknown as typeof fetch;
  try {
    assert.equal(await voiceWeather('2026-09-17', 's921', WX_TEXT, 'Orus', blob), fakeUrl);
    assert.equal(headCalls, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
