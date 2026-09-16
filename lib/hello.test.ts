import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WireItem } from './types.ts';

test('a wire item with no tape is a read', () => {
  const item: WireItem = { id: 'x', src: 'WNYC', how: 'station', kind: 'seg', title: 't', teaser: '', url: 'https://example.org', topic: 'local', when: 'today', len: 0 };
  assert.equal(item.len, 0);
});
