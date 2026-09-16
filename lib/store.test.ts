import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStale } from './store';

test('the file just written is never stale', () => {
  assert.equal(isStale(new Date()), false);
});

test('a file past the retention window is stale', () => {
  assert.equal(isStale(new Date(Date.now() - 8 * 864e5)), true);
});

test('the boundary is exactly seven days', () => {
  const now = Date.now();
  assert.equal(isStale(new Date(now - 6.99 * 864e5), now), false);
  assert.equal(isStale(new Date(now - 7.01 * 864e5), now), true);
});

test('a malformed timestamp is kept, never deleted', () => {
  assert.equal(isStale(new Date('nonsense')), false);
});
