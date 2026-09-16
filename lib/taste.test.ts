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
});
