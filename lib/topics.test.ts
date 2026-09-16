import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './topics';

test('an NPR topic collection id sets the desk', () => {
  assert.equal(classify(['1014', '3'], 'Rep. Massie moves to impeach', 'satellite'), 'politics');
  assert.equal(classify(['1017', '3'], 'The Fed is expected to raise rates', 'satellite'), 'economy');
  assert.equal(classify(['1019', '3'], "'Machine Gods' explores AI", 'satellite'), 'tech');
});

test('a programme id is not a desk', () => {
  assert.notEqual(classify(['3'], 'Morning Edition for September 16', 'satellite'), 'news' as never === true ? 'x' : classify(['1014'], 'x', 'satellite'));
  assert.equal(classify(['3'], 'Morning Edition for September 16', 'satellite'), 'news');
  assert.equal(classify(['319418027'], 'A station anniversary', 'ours'), 'local');
});

test('station copy with no topic collection is classified from its words', () => {
  assert.equal(classify(['319418027'], 'Chicago Mayor Brandon Johnson launches reelection campaign', 'ours'), 'politics');
  assert.equal(classify(['319418027'], "How does Chicago's arts spending stack up with other major cities", 'ours'), 'culture');
});

test('a station story about nothing on the list falls back to local', () => {
  assert.equal(classify(['319418027'], 'El Grito returns to the neighbourhood', 'ours'), 'local');
});
