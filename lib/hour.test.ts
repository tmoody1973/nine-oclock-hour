import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, score } from './hour';
import type { Block } from './types';

const seg = (id: string, len: number, extra: Partial<Block> = {}): Block =>
  ({ id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra });

// **These four were rewritten after running the prototype's real `layout()`.** The original
// first assertion — "the weather window lands at 19:00 when the hour is shorter than that" —
// **fails against the actual engine**: with 600s of content the window lands at 600, not
// 1140. Nobody had executed it. Port the engine as it is; these assert what it really does.
test('an under-filled hour packs the windows against the content', () => {
  const { rows, end } = layout([seg('a', 600)], false);
  assert.equal(rows.find((r) => r.b.id === 'wx')?.at, 600, 'not 19:00 — the window follows the content');
  assert.ok(end < 3540, 'and the hour comes up short, which is what the Clock score penalises');
});

test('content filling exactly to 19:00 puts the weather window on 19:00', () => {
  const { rows } = layout([seg('a', 19 * 60)], false);
  assert.equal(rows.find((r) => r.b.id === 'wx')?.at, 19 * 60);
});

test('a segment still running at 19:00 crashes the window and says by how much', () => {
  const { crashes } = layout([seg('a', 19 * 60 + 30)], false);
  assert.equal(crashes[0].over, 30);
});

test('pledge week adds two pitch breaks', () => {
  const plain = layout([seg('a', 60)], false).end;
  const pledged = layout([seg('a', 60)], true).end;
  assert.equal(pledged - plain, 240);
});

test('an hour that lands inside five seconds scores full marks on the clock', () => {
  const blocks = [seg('id', 60, { fixed: true }), seg('a', 3600 - 90 - 60)];
  const out = score(blocks, { pledge: false, flash: 'now', drift: 0, weights: {} });
  assert.equal(out.scores.Clock, 30);
});
