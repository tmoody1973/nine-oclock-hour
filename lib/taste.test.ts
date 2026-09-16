import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightsFor } from './taste';
import { score } from './hour';
import type { Block } from './types';

const seg = (id: string, len: number, extra: Partial<Block> = {}): Block =>
  ({ id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra });

test('a topic you picked costs nothing; one you did not costs double', () => {
  const w = weightsFor(['music', 'local', 'world']);
  assert.equal(w.music, 0);
  assert.equal(w.world, 0);
  assert.equal(w.politics, 2);
});

test('the meter actually responds to the listener — this is the whole feature', () => {
  // Six heavy stories: an hour that punishes a generic listener and rewards one who chose
  // these subjects. Verified against the real engine before being written here — generic
  // scores Hold 5 with the curve bottoming at 58; a listener who picked politics/world/
  // economy scores 8, bottoming at 70.
  //
  // **The picks must be HEAVY topics and the hour must contain them.** An earlier draft of
  // this test used an hour of politics + music and picks of music/local/world, and produced
  // an identical score for both listeners — see the note below on why.
  const hour = [
    seg('a', 300, { topic: 'politics' }), seg('b', 300, { topic: 'world' }), seg('c', 300, { topic: 'economy' }),
    seg('d', 300, { topic: 'politics' }), seg('e', 300, { topic: 'world' }), seg('f', 300, { topic: 'economy' }),
  ];
  const opts = { pledge: false, flash: 'now' as const, drift: 0 };
  const generic = score(hour, { ...opts, weights: {} });
  const mine = score(hour, { ...opts, weights: weightsFor(['politics', 'world', 'economy']) });
  assert.ok(mine.scores.Hold > generic.scores.Hold,
    'a listener who chose these subjects must hold this hour better than one who chose nothing');
  assert.ok(mine.low > generic.low,
    'and their retention curve must bottom out higher');
  // Pinned, not merely ordered. `>` alone still passes if the effect SHRINKS - a personalised
  // listener scoring 6 instead of 8 is a degraded feature that still sorts the right way round.
  // These four are the numbers the comment above claims, verified against the real engine.
  assert.equal(generic.scores.Hold, 5, 'generic listener must still score exactly 5');
  assert.equal(generic.low, 58, 'and bottom out at exactly 58');
  assert.equal(mine.scores.Hold, 8, 'personalised listener must still score exactly 8');
  assert.equal(mine.low, 70, 'and bottom out at exactly 70');
});

test('picking one of two heavy topics lands between picking neither and both', () => {
  // politics and health alternating, three each. Verified against the real engine: nothing
  // picked 5/58, politics only 6/64, both 8/70. The MIDDLE value is the whole point - a bug
  // that read one representative weight and applied it to every block could only ever produce
  // the 5 or the 8, never the 6. This is what proves hour.ts:242's lookup is really per-block.
  const hour = [
    seg('a', 300, { topic: 'politics' }), seg('b', 300, { topic: 'health' }), seg('c', 300, { topic: 'politics' }),
    seg('d', 300, { topic: 'health' }), seg('e', 300, { topic: 'politics' }), seg('f', 300, { topic: 'health' }),
  ];
  const opts = { pledge: false, flash: 'now' as const, drift: 0 };
  const none = score(hour, { ...opts, weights: {} });
  const one = score(hour, { ...opts, weights: weightsFor(['politics']) });
  const both = score(hour, { ...opts, weights: weightsFor(['politics', 'health']) });
  assert.equal(none.scores.Hold, 5); assert.equal(none.low, 58);
  assert.equal(one.scores.Hold, 6); assert.equal(one.low, 64);
  assert.equal(both.scores.Hold, 8); assert.equal(both.low, 70);
  assert.ok(one.scores.Hold > none.scores.Hold && one.scores.Hold < both.scores.Hold,
    'one topic picked must land strictly between none and both');
});
