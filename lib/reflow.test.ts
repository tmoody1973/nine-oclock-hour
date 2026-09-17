import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costsYou, reflowOf } from './reflow';
import type { Block, Topic } from './types';

// The weather window opens at 19:00 and traffic at 49:00 (lib/hour.ts). An hour built to sit
// just short of nineteen minutes is the interesting case: pull something early and whatever
// follows slides up into the window.
const seg = (id: string, len: number, label = id): Block => ({
  id, label, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news' as Topic, src: 'NPR',
});

test('pulling a story makes the hour shorter by exactly its length', () => {
  const hour = [seg('a', 300), seg('b', 240), seg('c', 180)];
  assert.equal(reflowOf(hour, 'b').shorterBy, 240);
});

test('pulling something that is not in the hour changes nothing', () => {
  const hour = [seg('a', 300)];
  const r = reflowOf(hour, 'nope');
  assert.equal(r.shorterBy, 0);
  assert.deepEqual(r.gained, []);
  assert.deepEqual(r.cleared, []);
});

// THE CASE THE DESIGN DOC DESCRIBES. Everything after the pull slides up, and something that
// used to clear the weather window now runs into it. That is the real cost of the move, and it
// is knowable before a single minute is spent on it.
test('pulling from the middle can send a later story into the weather window', () => {
  // 19:00 is 1140s. a+b lands EXACTLY on it, so the window opens clean and the newscast starts
  // after it — nothing crashes. Pull the filler and the newscast slides up to 600, running to
  // 1500, straight through the window it used to clear.
  const hour = [seg('a', 600), seg('b', 540, 'A filler piece'), seg('c', 900, 'The newscast')];
  assert.deepEqual(reflowOf(hour, 'nothing').gained, [], 'the hour must start clean for this to mean anything');
  const r = reflowOf(hour, 'b');
  assert.ok(costsYou(r), 'the pull created no crash, so the example is not exercising the reflow');
  assert.ok(r.gained.some((c) => /weather/i.test(c.label)), `expected a weather crash, got ${JSON.stringify(r.gained)}`);
});

// Pulling the piece that was running into the window is usually the REPAIR. An hour that only
// ever warns teaches you to fear the control instead of using it.
test('pulling the story that was running into a window reports the crash as cleared', () => {
  const hour = [seg('a', 1000), seg('b', 400, 'The overrunning piece')];
  const before = reflowOf(hour, 'zzz');
  assert.deepEqual(before.gained, [], 'baseline should not invent crashes');
  const r = reflowOf(hour, 'b');
  assert.ok(r.cleared.some((c) => /weather/i.test(c.label)), `expected a cleared weather crash, got ${JSON.stringify(r.cleared)}`);
  assert.equal(costsYou(r), false, 'a repair must not be reported as a cost');
});

// Magnitude is deliberately not part of a crash's identity: a window still being run into, by
// a different amount, has NOT been fixed, and reporting it as both cleared and gained would
// tell the producer two opposite things about one collision.
test('a crash that only changes size is neither gained nor cleared', () => {
  const hour = [seg('a', 1100), seg('b', 200, 'Runs into weather'), seg('c', 100)];
  const r = reflowOf(hour, 'c');
  assert.deepEqual(r.gained, []);
  assert.deepEqual(r.cleared, []);
});

test('pulling the last story never creates a crash', () => {
  const hour = [seg('a', 600), seg('b', 400), seg('c', 300)];
  assert.deepEqual(reflowOf(hour, 'c').gained, []);
});

import { reflowNote } from './reflow';

test('the warning is about the pull you have not made yet, not the hour as it stands', () => {
  const hour = [seg('a', 600), seg('b', 540, 'A filler piece'), seg('c', 900, 'The newscast')];
  const note = reflowNote(reflowOf(hour, 'b'))!;
  assert.match(note, /^Pull it and everything after slides up into the weather window/);
});

test('a pull that repairs the hour says so, rather than only ever warning', () => {
  const hour = [seg('a', 1000), seg('b', 400, 'The overrunning piece')];
  assert.match(reflowNote(reflowOf(hour, 'b'))!, /^Pulling it clears the weather window/);
});

test('a pull that changes nothing says nothing', () => {
  const hour = [seg('a', 600), seg('b', 300), seg('c', 200)];
  assert.equal(reflowNote(reflowOf(hour, 'c')), null);
});
