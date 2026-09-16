import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcs, HOUR } from './clock';
// The brief's own snippet uses `Block` without importing it — fine for `tsx` at test time
// (types are erased), but the CI build runs `tsc` too, which would fail on an unresolved
// name. Importing it here changes nothing about what the tests check.
import type { Block } from './types';

const row = (id: string, at: number, len: number, extra: Partial<Block> = {}): { at: number; b: Block } =>
  ({ at, b: { id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra } });

test('the hour starts at twelve o clock and runs clockwise', () => {
  const [a] = arcs([row('a', 0, 900)]);
  assert.equal(a.a0, 0);
  assert.equal(a.a1, 90, 'fifteen minutes is a quarter turn');
});

test('an element keeps its true seconds even when the arc is widened', () => {
  const [a] = arcs([row('silence', 59 * 60, 5)]);
  assert.equal(a.seconds, 5, 'the number never lies');
  assert.ok(a.a1 - a.a0 >= (20 / HOUR) * 360 - 1e-9, 'the arc is floored so it can be seen');
  assert.equal(a.minWidthApplied, true);
});

test('an element longer than the floor is drawn at its true width', () => {
  const [a] = arcs([row('seg', 0, 11 * 60 + 29)]);
  assert.equal(a.minWidthApplied, false);
  assert.ok(Math.abs((a.a1 - a.a0) - ((11 * 60 + 29) / HOUR) * 360) < 1e-9);
});

test('the ring is a real hour, not the schedulable 3540 — the gap is meant to be there', () => {
  // Guards against someone closing the 6-degree gap by setting HOUR = 3540, which would
  // slide every wedge out of position, worst at the end of the hour.
  assert.equal(HOUR, 3600);
  const [wx] = arcs([row('wx', 49 * 60, 45, { window: true })]);
  assert.ok(Math.abs(wx.a0 - 294) < 1e-9, 'the traffic window sits at 49:00 of a real hour');
});

test('every arc is classified, and the classes match the reference key', () => {
  const out = arcs([row('wx', 19 * 60, 45, { window: true }), row('uw', 21 * 60, 30, { credit: true }), row('cast', 0, 179, { kind: 'newscast' })]);
  assert.deepEqual(out.map((a) => a.kind), ['window', 'credit', 'newscast']);
});

test('a block of exactly HOUR seconds still draws a visible wedge, not a vanished one', () => {
  // At seconds === HOUR the naive floor (max only, no ceiling) puts a1 - a0 at exactly 360:
  // the wedge's start and end point coincide, and SVG draws nothing.
  const [a] = arcs([row('full', 0, HOUR)]);
  assert.equal(a.seconds, HOUR, 'the number never lies, even when the drawn arc is capped');
  assert.ok(a.a1 - a.a0 > 0 && a.a1 - a.a0 < 360, 'a real, non-degenerate wedge');
});

test('a block longer than the hour does not wrap the arc backwards', () => {
  // Past HOUR, the naive floor draws a1 - a0 > 360, which wraps around to a *shorter*
  // apparent wedge (sweep - 360) instead of the longest one on the ring.
  const [a] = arcs([row('over', 0, HOUR + 300)]);
  assert.equal(a.seconds, HOUR + 300, 'the number never lies');
  assert.equal(a.a1 - a.a0, ((HOUR - 1) / HOUR) * 360, 'clamped to just under a full turn, not wrapped');
});
