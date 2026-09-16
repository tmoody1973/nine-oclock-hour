import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toWireItem } from './cds';

const doc = JSON.parse(readFileSync(new URL('./fixtures/me.json', import.meta.url), 'utf8')).resources[0];

test('a Morning Edition document becomes a satellite wire item with its runtime', () => {
  const item = toWireItem(doc, 'satellite', 'Morning Edition');
  assert.equal(item.how, 'satellite');
  assert.ok(item.title.length > 0);
  assert.ok(item.url.startsWith('https://'));
  assert.ok(item.len > 0, 'runtime comes from the audio asset duration');
  assert.ok(!item.teaser.includes('<'), 'html is stripped from the teaser');
  assert.notEqual(item.topic, 'news', 'the desk comes from the story\'s NPR topic collection, not the default');
});
