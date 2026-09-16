import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostCarried } from './day';
import type { WireItem } from './types';

const item = (id: string, src: string, title: string): WireItem =>
  ({ id, src, how: 'station', kind: 'seg', title, teaser: '', url: 'https://example.org/' + id, topic: 'news', when: '2026-09-16', len: 60 });

test('the most carried story is the title the most newsrooms filed on', () => {
  const out = mostCarried([
    item('a', 'WNYC', 'The Fed raises rates'),
    item('b', 'WBEZ', 'The Fed raises rates again'),
    item('c', 'KQED', 'A strike at the opera'),
  ]);
  assert.equal(out.stations, 2);
  assert.match(out.title, /Fed/);
});
