import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostCarried } from './day';
import type { WireItem } from './types';

const item = (id: string, src: string, title: string): WireItem =>
  ({ id, src, how: 'station', kind: 'seg', title, teaser: '', url: 'https://example.org/' + id, topic: 'news', when: '2026-09-16', len: 60 });

test('the most carried story is the title the most newsrooms filed on', () => {
  const out = mostCarried([
    item('a', 'WNYC', 'The Fed raises interest rates'),
    item('b', 'WBEZ', 'The Fed raises interest rates again'),
    item('c', 'KQED', 'A strike at the opera'),
  ]);
  assert.equal(out.stations, 2);
  assert.match(out.title, /Fed/);
});

test('two headlines sharing only a common news phrase are NOT the same story', () => {
  const out = mostCarried([
    item('a', 'WBEZ', 'Washington Park mass shooting rattles community'),
    item('b', 'WABE', 'Federal case against man accused of plotting mass shooting'),
  ]);
  assert.equal(out.stations, 0, 'no answer is the correct answer here');
  assert.equal(out.title, '', 'and it must not offer a title it cannot stand behind');
});

test('a lone story does not count itself as a newsroom', () => {
  const out = mostCarried([item('a', 'WBEZ', 'Washington Park mass shooting rattles community')]);
  assert.equal(out.stations, 0, 'one newsroom is not "most carried"');
});

test('an empty wire returns no answer rather than throwing', () => {
  assert.deepEqual(mostCarried([]), { title: '', url: '', stations: 0 });
});
