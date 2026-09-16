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

// Proves the exact pattern app/api/cron/build-day/route.ts uses to track per-item voicing
// failures under concurrency: an array pre-filled pessimistically, with each success
// clearing only its own marker via read-filter-reassign. That reassignment has no `await`
// between reading the array and writing it back, so even with several workers finishing at
// genuinely overlapping times (staggered by a random delay here, not a same-tick
// coincidence), JS's run-to-completion semantics mean only one worker's clear executes at a
// time against the array the one before it just left — no lost updates.
test("clearing a marker on success never loses a concurrent sibling's marker", async () => {
  const ids = [1, 2, 3, 4, 5, 6];
  let degraded = ids.map((id) => `voice:${id}`); // pessimistic: everyone starts marked failed
  const neverSucceeds = new Set([3, 5]);
  await pool(ids, 6, async (id) => {
    await new Promise((r) => setTimeout(r, Math.random() * 15));
    if (neverSucceeds.has(id)) return; // marker stays, as if voicing had failed
    degraded = degraded.filter((d) => d !== `voice:${id}`);
  });
  assert.deepEqual(degraded.slice().sort(), ['voice:3', 'voice:5']);
});
