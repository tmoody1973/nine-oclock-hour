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

// Found by playing an hour to its end in a real browser: the aircheck rendered Mix -4/15.
// Three of Mix's four penalties (fewer than two locals, no music, thin on network) are
// floored at zero together, but the fourth (three-plus heavy topics back to back) is applied
// afterward, with no floor of its own — 15 -> 9 -> 4 -> 0 (floor holds) -> -4. This hour trips
// all four at once: three 'station' blocks (never 'ours', so locals stays 0), all heavy
// topics back to back (worstRun 3), none music, none network satellite/seg.
test('all four Mix penalties at once still cannot push the score negative', () => {
  const blocks = [
    seg('a', 200, { how: 'station', topic: 'politics' }),
    seg('b', 200, { how: 'station', topic: 'world' }),
    seg('c', 200, { how: 'station', topic: 'economy' }),
  ];
  const out = score(blocks, { pledge: false, flash: 'now', drift: 0, weights: {} });
  assert.ok(out.scores.Mix >= 0, 'no score may be negative');
});

// Deliberate choice, not a side effect of the fix above: "Local, network and music in
// proportion" describes only the three source-mix checks (locals/music/network), so it must
// still fire — truthfully — on an hour that passes all three but ALSO ran three heavy topics
// back to back. That penalty is a separate concern (pacing), and the note is checked against
// the pre-grim-run value on purpose. If a later edit moved this check after the grim-run
// deduction, this hour (mix would read 11, not 15) would make the note wrongly disappear.
test('the "in proportion" note still fires even when the later grim-run penalty also applies', () => {
  const blocks = [
    seg('n1', 200, { how: 'ours', topic: 'local' }),
    seg('n2', 200, { how: 'ours', topic: 'local' }),
    seg('m1', 200, { music: true, topic: 'music' }),
    seg('h1', 200, { how: 'satellite', kind: 'seg', topic: 'politics' }),
    seg('h2', 200, { how: 'satellite', kind: 'seg', topic: 'world' }),
    seg('h3', 200, { how: 'satellite', kind: 'seg', topic: 'economy' }),
  ];
  const out = score(blocks, { pledge: false, flash: 'now', drift: 0, weights: {} });
  assert.equal(out.scores.Mix, 11, 'only the grim-run penalty should apply: 15 - 4');
  assert.ok(out.notes.some(([, text]) => text.includes('in proportion')), 'the proportion note must still fire');
  assert.ok(out.notes.some(([, text]) => text.includes('grim stories ran back to back')), 'and the grim-run warning must also fire');
});
