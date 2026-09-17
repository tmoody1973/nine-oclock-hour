import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioLog, disagreement } from './audiolog';

test('entries are stamped from the first record, in order', () => {
  let t = 1000;
  const log = audioLog(() => t);
  t = 1005; log.record('play called');
  t = 1060; log.record('play rejected', 'AbortError');
  assert.deepEqual(log.entries().map((e) => [e.t, e.what]), [[5, 'play called'], [60, 'play rejected']]);
});

// The codebase's immutability rule, and not a theoretical one here: the on-screen view holds
// the array it was handed while more entries arrive behind it.
test('a caller holding an earlier snapshot never sees it change underneath them', () => {
  const log = audioLog(() => 0);
  log.record('first');
  const held = log.entries();
  log.record('second');
  assert.equal(held.length, 1);
  assert.equal(log.entries().length, 2);
});

test('lines read as a log a person can scan on a phone', () => {
  let t = 0;
  const log = audioLog(() => t);
  t = 12; log.record('resume resolved', 'state=running');
  assert.equal(log.lines()[0], '   12ms  resume resolved  — state=running');
});

// THE CASE THAT MATTERS. Phaser sets unlocked when resume() RESOLVES and never reads the
// state, so it will happily report success on a context that is still suspended — the same
// premise the React build rested on, moved rather than removed.
test('Phaser claiming unlocked over a suspended context is called out, not believed', () => {
  const d = disagreement(true, 'suspended');
  assert.ok(d, 'the disagreement went unreported');
  assert.match(d, /Nothing will come out of the speakers/);
});

test('the opposite disagreement is reported too', () => {
  assert.match(disagreement(false, 'running')!, /still reports locked/);
});

test('agreement is silent — nothing to say when both answers match', () => {
  assert.equal(disagreement(true, 'running'), null);
  assert.equal(disagreement(false, 'suspended'), null);
});
