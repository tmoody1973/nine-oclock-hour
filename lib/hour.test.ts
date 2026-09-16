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

// Same shape of bug as Mix, in the same function: `onair`'s floor sits at line ~157, but the
// window-crash loop (-5 per crash), the missed-credit case (-8), and the late-credit case
// (-6) all fire after it. One long block with no windows dodged and no credit at all produces
// three crash entries (a block that overruns a window is recorded as an "over" crash when the
// overrun is first detected, then again as a "late" crash when the window is actually placed)
// plus the missed-credit penalty, on top of skipping the bulletin — comfortably enough to go
// negative. Confirmed on the pre-fix code: On air: -4 (25 - 6 skip - 15 three crashes - 8
// missed credit = -4), matching the shape of the -4/15 Mix bug exactly.
test('a badly crashed hour still cannot push On air negative', () => {
  const out = score([seg('a', 3200)], { pledge: false, flash: 'skip', drift: 0, weights: {} });
  assert.ok(out.scores['On air'] >= 0, 'no score may be negative');
});

// The bug class, not just this one instance: every headline score is built the same way
// (start high, subtract, floor somewhere) and nothing stops a future deduction from landing
// after a floor again. Pinning this across a few adversarial hours catches the next instance
// without anyone needing to find -N/M on screen first.
test('no score goes negative across several adversarial hours', () => {
  const cases: { label: string; blocks: Block[]; opts: Parameters<typeof score>[1] }[] = [
    { label: 'empty hour', blocks: [], opts: { pledge: false, flash: 'now', drift: 0, weights: {} } },
    {
      label: 'all four Mix penalties',
      blocks: [
        seg('a', 200, { how: 'station', topic: 'politics' }),
        seg('b', 200, { how: 'station', topic: 'world' }),
        seg('c', 200, { how: 'station', topic: 'economy' }),
      ],
      opts: { pledge: false, flash: 'now', drift: 0, weights: {} },
    },
    { label: 'crashed windows, skipped bulletin, no credit', blocks: [seg('a', 3200)], opts: { pledge: false, flash: 'skip', drift: 0, weights: {} } },
    {
      label: 'stale newscast, pledge week, and a badly crashed hour',
      blocks: [seg('cast', 280, { kind: 'newscast', mode: 'tape', expired: true }), seg('long', 3200)],
      opts: { pledge: true, flash: 'skip', drift: 0, weights: {} },
    },
  ];
  for (const { label, blocks, opts } of cases) {
    const out = score(blocks, opts);
    for (const [key, value] of Object.entries(out.scores)) {
      assert.ok(value >= 0, `${label}: ${key} went negative (${value})`);
    }
  }
});
