import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nothingToHear, previewSource, sourceNote } from './preview';
import type { Topic, WireItem } from './types';

const item = (extra: Partial<WireItem> = {}): WireItem => ({
  id: 'x', src: 'WBEZ', how: 'satellite', kind: 'seg', title: 't', teaser: '', url: '',
  topic: 'news' as Topic, when: 'this morning', len: 280, ...extra,
});

test("a story with the newsroom's tape previews the tape", () => {
  const s = previewSource(item({ audio: 'https://wbez.example/a.mp3' }));
  assert.deepEqual(s, { url: 'https://wbez.example/a.mp3', what: 'tape', from: 'WBEZ' });
});

// A producer auditioning a story is deciding whether to ROLL it, and the tape is what would go
// to air. Voicing a story never takes the roll away — the two coexist by design (lib/wire.ts).
test('a story carrying both tape and our read previews the tape, not our voice', () => {
  const s = previewSource(item({ audio: 'https://wbez.example/a.mp3', spokenAudio: 'https://blob/read.wav' }));
  assert.equal(s?.what, 'tape');
});

test('a text story with no tape falls back to our voiced read', () => {
  const s = previewSource(item({ len: 0, spokenAudio: 'https://blob/read.wav' }));
  assert.deepEqual(s, { url: 'https://blob/read.wav', what: 'read', from: 'WBEZ' });
});

// THE LEGACY TRAP. Day files written before `spokenAudio` existed put our voiced read in
// `audio` behind the `spoken` flag, and they stay on disk for seven days. Treating that as the
// newsroom's tape would put our synthetic voice out under their name and tell the listener it
// was streaming from their server — wrong twice over.
test("yesterday's read stored the old way is our read, never mistaken for the newsroom's tape", () => {
  const s = previewSource(item({ audio: 'https://blob/read.wav', spoken: true }));
  assert.equal(s?.what, 'read', 'our voiced read was labelled as the publisher tape');
});

test('a story with nothing to hear says so rather than offering a dead control', () => {
  const bare = item({ len: 0 });
  assert.equal(previewSource(bare), null);
  assert.match(nothingToHear(bare)!, /WBEZ filed this as text/);
});

test('a story that can be heard has no excuse attached to it', () => {
  assert.equal(nothingToHear(item({ audio: 'https://wbez.example/a.mp3' })), null);
});

// "Their content, their audio, their link" is a commitment the app makes in writing, so the
// player has to say whose server the sound is coming off.
test('the player says the tape streams from the newsroom and that nothing is copied', () => {
  const note = sourceNote({ url: 'u', what: 'tape', from: 'KCRW' });
  assert.match(note, /KCRW/);
  assert.match(note, /Nothing is copied here/);
});

test('our own read is credited to us, not dressed up as the newsroom streaming', () => {
  const note = sourceNote({ url: 'u', what: 'read', from: 'KCRW' });
  assert.match(note, /Our own read/);
  assert.doesNotMatch(note, /Nothing is copied here/);
});
