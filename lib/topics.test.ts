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

test('the keyword pass covers every desk it claims to, from realistic station headlines', () => {
  assert.equal(classify(['319418027'], 'Summerfest announces the lineup for its music stages', 'ours'), 'music');
  assert.equal(classify(['319418027'], 'City breaks ground on a new solar array as drought concerns grow', 'ours'), 'climate');
  assert.equal(classify(['319418027'], 'New clinic opens to serve patients without insurance', 'ours'), 'health');
  assert.equal(classify(['319418027'], 'Local startup raises funding for a new AI chip', 'ours'), 'tech');
  assert.equal(classify(['319418027'], 'Inflation pushes rents higher across the metro area', 'ours'), 'economy');
  assert.equal(classify(['319418027'], 'Local Ukrainian community holds a vigil for the war in Ukraine', 'ours'), 'world');
});

test('word-boundary and case traps that a later edit could easily reintroduce', () => {
  assert.equal(classify(['319418027'], 'The record store highlights new albums this week', 'ours'), 'music', 'a trailing boundary would break the plural "albums"');
  assert.notEqual(classify(['319418027'], 'A musical adaptation opens downtown next month', 'ours'), 'music', 'the bare "music" alternative must not match inside "musical"');
  assert.notEqual(classify(['319418027'], 'Volunteers fed 300 people at the shelter last night', 'ours'), 'economy', 'lower-case "fed" is the verb, not the Federal Reserve');
  assert.notEqual(classify(['319418027'], 'A city coalition forms over the school budget', 'ours'), 'climate', '"coal" must not match inside "coalition"');
});
