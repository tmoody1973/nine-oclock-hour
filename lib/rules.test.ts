import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_HOUR_BLOCKS, SCORES, airGate, countsForScore } from './rules';
import { score } from './hour';
import { LEGAL_ID } from './wire';
import type { Block } from './types';

const seg = (id: string, extra: Partial<Block> = {}): Block =>
  ({ id, label: id, len: 300, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra });

// The trap this whole helper exists for. The rail a producer is looking at shows THREE rows on
// a brand new hour -- the legal ID plus the weather and traffic windows -- but two of those are
// inserted by layout() and never reach `hour`, so the air button is still dead. Told "you need
// three blocks", a producer counts three on the rail and reports the button as broken. The gate
// has to speak in the only unit the producer controls: items they added themselves.
test('a fresh hour looks like three rows on the rail and is still two items short', () => {
  const gate = airGate([LEGAL_ID]);
  assert.equal(gate.ready, false);
  assert.equal(gate.need, 2);
  assert.match(gate.reason, /two more/i);
  // Never phrased as "three blocks": that is the number the producer cannot see.
  assert.doesNotMatch(gate.reason, /three/i);
});

test('one story in, and the gate asks for exactly one more', () => {
  const gate = airGate([LEGAL_ID, seg('a')]);
  assert.equal(gate.ready, false);
  assert.equal(gate.need, 1);
  assert.match(gate.reason, /one more/i);
});

test('two stories in, and the hour can air', () => {
  const gate = airGate([LEGAL_ID, seg('a'), seg('b')]);
  assert.equal(gate.ready, true);
  assert.equal(gate.need, 0);
  assert.equal(gate.reason, '');
});

// Pins the gate to the number HourBuilder actually disables the button on. If one moves and the
// other does not, the button and its explanation start disagreeing -- which is the exact class
// of bug this task exists to remove.
test('the gate opens on the same count the air button is disabled on', () => {
  const hour = [LEGAL_ID, seg('a'), seg('b')];
  assert.equal(airGate(hour).ready, hour.length >= MIN_HOUR_BLOCKS);
  assert.equal(airGate(hour.slice(0, 2)).ready, false);
});

// The picker may only promise a score change it can actually deliver. weightsFor() records a
// weight for all ten topics, but score() reads that map on heavy blocks only, so the other five
// are inert -- see the comment in lib/taste.ts. This is the one list the picker is allowed to
// trust.
test('only the five topics the scorer actually reads count', () => {
  for (const t of ['news', 'politics', 'world', 'economy', 'health'] as const) {
    assert.equal(countsForScore(t), true, `${t} should count`);
  }
  for (const t of ['tech', 'culture', 'climate', 'local', 'music'] as const) {
    assert.equal(countsForScore(t), false, `${t} should not count`);
  }
});

// The panel tells a producer what they are being judged on BEFORE they air. If the engine ever
// renames a score, changes a maximum, or adds a sixth, this goes red rather than letting the
// panel quietly describe a scoreboard that no longer exists.
test('the scoreboard the panel promises is the scoreboard the engine returns', () => {
  const hour = [LEGAL_ID, seg('a'), seg('b', { topic: 'music', music: true })];
  const result = score(hour, { pledge: false, flash: 'now', drift: 0 });
  assert.deepEqual(SCORES.map((s) => s.label), Object.keys(result.scores));
  for (const s of SCORES) {
    assert.ok(result.scores[s.label] <= s.max, `${s.label} exceeded its stated maximum`);
  }
});

test('the five maxima add up to the hundred the aircheck reports', () => {
  assert.equal(SCORES.reduce((n, s) => n + s.max, 0), 100);
});

// Every score needs a plain-English line, or the panel has a blank row in it.
test('each score says what earns it', () => {
  for (const s of SCORES) assert.ok(s.what.length > 0, `${s.label} has no description`);
});
