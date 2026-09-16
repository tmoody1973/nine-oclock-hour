import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from './pool';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('every item is processed exactly once', async () => {
  const seen: number[] = [];
  await pool([1, 2, 3, 4, 5], 2, async (n) => { seen.push(n); });
  assert.deepEqual(seen.slice().sort((a, b) => a - b), [1, 2, 3, 4, 5]);
});

test('never runs more than `limit` items at once', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await pool(Array.from({ length: 9 }, (_, i) => i), 3, async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await delay(10);
    inFlight--;
  });
  assert.ok(maxInFlight <= 3, `expected at most 3 concurrent, saw ${maxInFlight}`);
  // Sanity check the test itself would catch a silently-sequential pool, not just a
  // too-wide one: a broken pool that never runs more than one at a time would also pass
  // `maxInFlight <= 3` above.
  assert.ok(maxInFlight > 1, 'this pool should actually run more than one item at a time');
});

// The backstop this pool adds beyond a plain Promise.all-of-workers: one item's rejection
// must not strand the rest of that worker's queue, and — for the cron's use — must not stop
// `degraded` from ever being recorded for the items that failed after it.
test('one item throwing does not stop the rest from being processed', async () => {
  const seen: number[] = [];
  await pool([1, 2, 3], 3, async (n) => {
    if (n === 2) throw new Error('boom');
    seen.push(n);
  });
  assert.deepEqual(seen.slice().sort((a, b) => a - b), [1, 3]);
});
