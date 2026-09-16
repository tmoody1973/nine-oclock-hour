import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byDesk, mixOf, DESK_ORDER, DESK_COLOR } from './desks';
import type { Block, WireItem } from './types';

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

// Pinned after review found two desks sharing a color — the bar's whole job is telling desks
// apart at a glance, so a duplicate defeats it even though the srOnly list keeps the real
// numbers knowable either way.
test('every desk on the mix bar has its own color', () => {
  const colors = DESK_ORDER.map((t) => DESK_COLOR[t]);
  assert.equal(new Set(colors).size, colors.length);
});
