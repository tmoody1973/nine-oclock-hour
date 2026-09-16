import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byDesk, mixOf, DESK_ORDER, DESK_NAME, DESK_COLOR } from './desks';
import type { Block, Topic, WireItem } from './types';

const item = (id: string, topic: WireItem['topic']): WireItem =>
  ({ id, src: 'NPR', how: 'satellite', kind: 'seg', title: id, teaser: '', url: 'https://npr.org/' + id, topic, when: '2026-09-16', len: 120 });

const block = (id: string, topic: Block['topic'], len = 120): Block =>
  ({ id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic });

test('the wire arrives in newspaper order, and empty desks do not render', () => {
  const desks = byDesk([item('a', 'music'), item('b', 'politics'), item('c', 'politics')]);
  assert.deepEqual(desks.map((d) => d.topic), ['politics', 'music']);
  assert.equal(desks[0].items.length, 2);
  assert.ok(!desks.some((d) => d.items.length === 0));
});

test('desk order follows DESK_ORDER, not the order stories arrived', () => {
  const desks = byDesk([item('a', 'local'), item('b', 'news')]);
  assert.deepEqual(desks.map((d) => d.topic), ['news', 'local']);
  assert.equal(DESK_ORDER[0], 'news');
});

test('the mix reports each desk as a share of programming seconds', () => {
  const mix = mixOf([block('a', 'politics', 300), block('b', 'world', 100)]);
  assert.equal(mix.total, 400);
  assert.equal(mix.shares.find((s) => s.topic === 'politics')?.seconds, 300);
  assert.ok(mix.shares[0].topic === 'politics', 'the heaviest desk is first');
});

test('an hour that is mostly one desk says so, and an even one does not', () => {
  assert.equal(mixOf([block('a', 'politics', 300), block('b', 'world', 100)]).lopsided, 'politics');
  assert.equal(mixOf([block('a', 'politics', 200), block('b', 'world', 200)]).lopsided, null);
});

test('fixed furniture is not part of the mix', () => {
  const mix = mixOf([block('a', 'politics', 300), { ...block('id', 'news', 60), fixed: true }]);
  assert.equal(mix.total, 300);
});

// The four below were not in the first draft of this task. They were added after running
// the implementation standalone and noticing these paths had no coverage — all four already
// behave correctly, so they cost nothing and pin behaviour that is easy to break later.
test('an empty hour does not divide by zero', () => {
  assert.deepEqual(mixOf([]), { total: 0, shares: [], lopsided: null });
});

test('an hour of nothing but furniture has no mix at all', () => {
  assert.equal(mixOf([{ ...block('id', 'news', 60), fixed: true }]).total, 0);
});

test('exactly half is not lopsided — the test is > 0.5, not >=', () => {
  assert.equal(mixOf([block('a', 'politics', 200), block('b', 'world', 200)]).lopsided, null);
});

test('untimed tape that ran long counts what it actually ran', () => {
  assert.equal(mixOf([{ ...block('a', 'politics', 120), realLen: 300 }]).total, 300);
});

// Pinned after review: two desks sharing a colour looked like a bug, but the fix isn't a
// 9th and 10th invented hue — it's MixBar's legend, which names every desk regardless of its
// colour. This pins the palette to exactly the dataviz skill's validated 8-hue set, so nobody
// "fixes" the collision later by adding unvalidated colours instead.
test('DESK_COLOR stays the validated 8-hue set, not invented extras', () => {
  const colors = new Set(DESK_ORDER.map((t) => DESK_COLOR[t]));
  assert.equal(colors.size, 8);
});

// Pinned after review: DESK_NAME and DESK_COLOR are Record<Topic, string>, so adding a topic
// without both is a type error — but DESK_ORDER is just a Topic[], so adding a topic without
// adding it HERE compiles fine and the desk silently never renders (byDesk only ever maps
// over DESK_ORDER). This is the one place that omission isn't caught by the compiler.
test('DESK_ORDER covers every desk in DESK_NAME — a topic missing here never renders', () => {
  const missing = (Object.keys(DESK_NAME) as Topic[]).filter((t) => !DESK_ORDER.includes(t));
  assert.deepEqual(missing, []);
  // Added after re-review: the check above computes only what is MISSING, and the palette test
  // uses a Set — so a duplicated entry passes both, while byDesk would render that desk twice.
  assert.equal(new Set(DESK_ORDER).size, DESK_ORDER.length, 'DESK_ORDER has a duplicate — that desk renders twice');
});
