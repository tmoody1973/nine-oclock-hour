import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLayout, tileTime, STRIP_DEFAULTS } from './strip';
import { DESK_ORDER } from './desks';
import type { Topic, WireItem } from './types';

const item = (id: string, topic: Topic, extra: Partial<WireItem> = {}): WireItem => ({
  id, src: 'NPR', how: 'satellite', kind: 'seg', title: id, teaser: '', url: '',
  topic, when: 'this morning', len: 280, ...extra,
});

// THE GUARD THE WHOLE DESIGN RESTS ON. The strip exists so that nothing is hidden: scarcity
// only bites when you can see what you are giving up, and the aircheck only teaches you
// anything if "I saw it and passed" is true. An item silently dropped by a layout bug breaks
// both, and would look exactly like a sparse morning.
test('every item on the wire gets a tile, exactly once', () => {
  const items = [
    item('a', 'news'), item('b', 'news'), item('c', 'news'), item('d', 'news'), item('e', 'news'),
    item('f', 'music'), item('g', 'local'), item('h', 'politics'), item('i', 'world'),
  ];
  const ids = stripLayout(items).groups.flatMap((g) => g.tiles.map((t) => t.id));
  assert.deepEqual([...ids].sort(), items.map((i) => i.id).sort());
  assert.equal(ids.length, new Set(ids).size, 'an item was tiled twice');
});

test('desks appear in the front-page order, not the order stories happened to land', () => {
  const items = [item('m', 'music'), item('n', 'news'), item('w', 'world')];
  const got = stripLayout(items).groups.map((g) => g.topic);
  const expected = DESK_ORDER.filter((t) => got.includes(t));
  assert.deepEqual(got, expected);
});

test('a desk with nothing on it is not drawn', () => {
  const groups = stripLayout([item('n', 'news')]).groups;
  assert.deepEqual(groups.map((g) => g.topic), ['news']);
});

// The name is what tells two desks apart, because the palette deliberately does not. Ten desks
// share eight hues: music repeats news's blue and local repeats politics's orange. If a group
// ever lost its name, those pairs would become indistinguishable and "desk" would stop being
// one of the five readable signals.
test('each group carries its desk name, which is what disambiguates the reused hues', () => {
  const groups = stripLayout([item('n', 'news'), item('m', 'music')]).groups;
  assert.deepEqual(groups.map((g) => g.name), ['News', 'Music']);
});

// Found by screenshotting the page rather than by any test: the first desk heading sat flush
// against y=0 and the canvas clipped its top half. A green suite said nothing about it.
test('the first desk heading clears the top edge, where the canvas would clip it', () => {
  const { groups } = stripLayout([item('a', 'news')]);
  assert.ok(groups[0].headerY > 0, 'the first heading sits at y=0 and will be clipped');
});

test('tiles wrap into rows at the given width and never overflow it', () => {
  const items = Array.from({ length: 9 }, (_, i) => item(`n${i}`, 'news'));
  const { groups } = stripLayout(items);
  const tiles = groups[0].tiles;
  const perRow = Math.floor((STRIP_DEFAULTS.width + STRIP_DEFAULTS.gap) / (STRIP_DEFAULTS.tileW + STRIP_DEFAULTS.gap));
  assert.equal(new Set(tiles.map((t) => t.y)).size, Math.ceil(9 / perRow), 'wrong number of rows');
  for (const t of tiles) assert.ok(t.x + t.w <= STRIP_DEFAULTS.width, `tile ran past the strip at x=${t.x}`);
});

// A caller handing in a width narrower than one tile used to be a divide-by-zero that dropped
// every item. Losing the whole wire must never be a silent outcome of a narrow screen.
test('a strip narrower than a single tile still shows every item, one per row', () => {
  const items = [item('a', 'news'), item('b', 'news')];
  const { groups } = stripLayout(items, { width: 10 });
  assert.equal(groups[0].tiles.length, 2);
  assert.notEqual(groups[0].tiles[0].y, groups[0].tiles[1].y);
});

test('the reported height covers the last tile drawn', () => {
  const items = Array.from({ length: 7 }, (_, i) => item(`n${i}`, 'news')).concat(item('m', 'music'));
  const s = stripLayout(items);
  const lowest = Math.max(...s.groups.flatMap((g) => g.tiles.map((t) => t.y + t.h)));
  assert.ok(s.height >= lowest, `height ${s.height} cuts off a tile ending at ${lowest}`);
});

test('a timed story shows its runtime', () => {
  assert.equal(tileTime(item('a', 'news', { len: 280 })), '4:40');
});

// Untimed tape is a gamble — "roll it and you find out live" — so it must never read as a
// confident number.
test('an untimed story is marked as an estimate, never as a runtime', () => {
  assert.equal(tileTime(item('a', 'news', { len: 0, est: 180 })), '≈3:00');
});

test('a story with no tape at all says so rather than showing 0:00', () => {
  assert.equal(tileTime(item('a', 'news', { len: 0 })), 'text');
});
