import { test } from 'node:test';
import assert from 'node:assert/strict';
import { block, buildWire, used } from './wire';
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
