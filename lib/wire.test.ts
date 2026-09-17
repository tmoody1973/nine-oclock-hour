import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { block, buildWire, rollable, used } from './wire';
import { toWireItem } from './cds';
import { toPlaylist } from './playlist';
import type { DayFile, WireItem } from './types';

const item = (over: Partial<WireItem> = {}): WireItem => ({
  id: 'a1', src: 'Morning Edition', how: 'satellite', kind: 'seg',
  title: 'The Fed is expected to raise rates', teaser: '', url: 'https://npr.org/a1',
  topic: 'economy', when: '2026-09-16', len: 214, ...over,
});

// This is the assertion the whole task exists to prove: Task 7's aircheck matches
// `day.mostCarried.title` against `Block.label`, and nothing had confirmed the two meet.
test('block() sets label from the wire item title, not from anything else', () => {
  const b = block(item({ title: 'A very specific headline' }), 'tape');
  assert.equal(b.label, 'A very specific headline');
});

test('a read is always thirty seconds, regardless of the tape length', () => {
  const b = block(item({ len: 400 }), 'read');
  assert.equal(b.len, 30);
});

test('a tape roll uses the real length when the feed has one', () => {
  const b = block(item({ len: 214 }), 'tape');
  assert.equal(b.len, 214);
  assert.equal(b.est, false);
});

test('a tape roll with no known length falls back to the estimate and flags it', () => {
  const b = block(item({ len: 0, est: 210 }), 'tape');
  assert.equal(b.len, 210);
  assert.equal(b.est, true);
});

test('a newscast past its expiry is marked expired; one still good is not', () => {
  const now = Date.parse('2026-09-16T14:00:00Z');
  const stale = block(item({ expires: '2026-09-16T13:00:00Z' }), 'tape', now);
  const fresh = block(item({ expires: '2026-09-16T15:00:00Z' }), 'tape', now);
  assert.equal(stale.expired, true);
  assert.equal(fresh.expired, false);
});

test('an item with no expiry at all is never expired', () => {
  const b = block(item(), 'tape');
  assert.equal(b.expired, false);
});

test('a tape roll over 900 seconds is flagged long; a read never is', () => {
  const long = block(item({ len: 1749 }), 'tape');
  const read = block(item({ len: 1749 }), 'read');
  assert.equal(long.long, true);
  assert.equal(read.long, false);
});

// This is the rights guard the whole feature exists to protect. `item.audio` on a
// tape-carrying item is the publisher's own audio; adding it to the hour as a 'read'
// must never let that tape through. Only voiceRead()'s own audio — marked by
// `item.spoken` — may stream from a read block. Keying on `mode === 'read'` alone would
// pass this test too, which is exactly why it exists.
test("another newsroom's tape added as a read carries no audio, even though item.audio is set", () => {
  const b = block(item({ how: 'station', audio: 'https://wbez.example/tape.mp3' }), 'read');
  assert.equal(b.audio, undefined);
  assert.equal(b.spoken, false);
});

test('a voiced read carries its own audio, and is marked spoken', () => {
  const b = block(item({ audio: 'https://blob.example/reads/x.wav', spoken: true }), 'read');
  assert.equal(b.audio, 'https://blob.example/reads/x.wav');
  assert.equal(b.spoken, true);
});

test('spoken never applies to a tape block, regardless of the flag on the wire item', () => {
  const b = block(item({ audio: 'https://npr.example/tape.mp3', spoken: true }), 'tape');
  assert.equal(b.audio, 'https://npr.example/tape.mp3');
  assert.equal(b.spoken, false);
});

const day = (): DayFile => ({
  date: '2026-09-16', builtAt: '2026-09-16T05:00:00Z',
  network: [item({ id: 'net1' })],
  stations: {
    home: { name: 'Home Station', city: 'Home City', neighbour: 'nb', local: [item({ id: 'h1' }), item({ id: 'h2' })] },
    nb: { name: 'Neighbour Station', city: 'Neighbour City', neighbour: 'home', local: [item({ id: 'n1' }), item({ id: 'n2' }), item({ id: 'n3' })] },
  },
  mostCarried: { title: '', url: '', stations: 0 },
});

test('buildWire mixes network, the home station\'s own local items, and only the neighbour\'s first two', () => {
  const wire = buildWire(day(), 'home');
  assert.deepEqual(wire.map((w) => w.id), ['net1', 'h1', 'h2', 'nb-n1', 'nb-n2']);
});

// Not reachable through lib/day.ts today (it always writes all six stations), but the
// score() call site already treats a missing neighbour as possible, so this guards against
// the two disagreeing — and against a future caller that isn't lib/day.ts.
test('a station whose neighbour is missing from the day file gets network and its own items, no throw', () => {
  const broken = day();
  broken.stations.home.neighbour = 'does-not-exist';
  const wire = buildWire(broken, 'home');
  assert.deepEqual(wire.map((w) => w.id), ['net1', 'h1', 'h2']);
});

test('borrowed neighbour items are relabeled "station" so they cannot be rolled', () => {
  const wire = buildWire(day(), 'home');
  const borrowed = wire.find((w) => w.id === 'nb-n1')!;
  assert.equal(borrowed.how, 'station');
});

test('the home station\'s own items keep their own how, unchanged', () => {
  const wire = buildWire(day(), 'home');
  const own = wire.find((w) => w.id === 'h1')!;
  assert.equal(own.how, 'satellite'); // fixture default; buildWire must not touch it
});

test('used() finds a block regardless of whether it was added as tape or read', () => {
  const tapeBlock = block(item({ id: 'x' }), 'tape');
  const readBlock = block(item({ id: 'y' }), 'read');
  assert.equal(used([tapeBlock], item({ id: 'x' })), true);
  assert.equal(used([readBlock], item({ id: 'y' })), true);
  assert.equal(used([tapeBlock], item({ id: 'z' })), false);
});

// ─── The untimed item, and the dead air it used to cause ──────────────────────────────────
const untimedDoc = JSON.parse(readFileSync(new URL('./fixtures/untimed.json', import.meta.url), 'utf8')).resources[0];

// THE POINT OF THE est PRODUCER, and it was never the number. An item that arrives with the
// publisher's audio but no duration used to fall through BOTH paths at once:
//   - rollable() was false (len 0, est undefined), so the wire offered a disabled "No tape";
//   - the cron skips voicing anything already carrying an audio href — see
//     `if (item.audio || seenIds.has(item.id)) return false` in the build-day route — so it
//     was never spoken and item.spoken was never set;
//   - block(item, 'read') carries audio only for OUR OWN voiced take, so the block got none;
//   - toPlaylist then keeps the entry with audio undefined, and <Player> runs a timer for the
//     block's full length with nothing playing.
// Thirty seconds of dead air, on a radio product, for the one item class that neither path
// could serve. With est set the roll path opens again, which is what the front page promises
// the producer: "Untimed tape is a gamble. Roll one and you find out live."
test('an untimed item with publisher audio is rollable, not stranded between both paths', () => {
  const untimed = toWireItem(untimedDoc, 'satellite', 'WBEZ');
  assert.equal(untimed.len, 0, 'the feed never timed it');
  assert.ok(untimed.audio, 'but the tape itself is there to roll');
  assert.equal(rollable(untimed), true, 'so the producer must be offered it, at an estimate');
});

test('rolling an untimed item streams real audio, at its estimated length', () => {
  const untimed = toWireItem(untimedDoc, 'satellite', 'WBEZ');
  const [entry] = toPlaylist([block(untimed, 'tape')]);
  assert.equal(entry.audio, untimed.audio, 'satellite tape is ours to roll, so it streams');
  assert.equal(entry.seconds, untimed.est, 'scheduled at the estimate, not at the 30s read fallback');
});

// CHARACTERISATION, not a fix — this pins the SHAPE of dead air so it cannot return unnoticed,
// and it corrects a claim made during review: toPlaylist does NOT drop an unvoiced read. It
// keeps the entry and blanks its audio, which is why the failure is a silent timer rather than
// a missing track. A test asserting the entry is absent would fail against correct code.
//
// Both gates that produce this are deliberate RIGHTS protections with their reasoning written
// beside them: a read may carry audio only when it is our own voiced take, and toPlaylist
// streams tape only for satellite/ours. Neither may be loosened to chase the silence. The cure
// is upstream — let the producer roll it (est), or voice it.
test('an unvoiced read keeps its playlist entry and plays silent — the shape of dead air', () => {
  const unvoiced = item({ audio: 'https://wbez.example/tape.mp3' });
  const list = toPlaylist([block(unvoiced, 'read')]);
  assert.equal(list.length, 1, 'the entry is kept, not dropped');
  assert.equal(list[0].audio, undefined, "the publisher's tape must never stream from a read");
  assert.equal(list[0].seconds, 30, 'so the player runs a 30-second timer with nothing playing');
});
