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

// The untimed case: the feed carries the file but never says how long it runs. This is the
// producer for `WireItem.est`, and with it the whole drift mechanic — rollable(), Block.est,
// score()'s drift walk and the "untimed tape ran long/short" note all hang off this one
// field. Uses its own fixture because every asset in me.json (a captured live response that
// must stay faithful) carries a duration, so this path never occurs in that sample.
const untimed = JSON.parse(readFileSync(new URL('./fixtures/untimed.json', import.meta.url), 'utf8')).resources[0];

test('a document whose audio asset carries no duration gets an estimate, and stays untimed', () => {
  const item = toWireItem(untimed, 'ours', 'WBEZ');
  assert.equal(item.len, 0, 'len is what the feed actually told us, and it told us nothing');
  assert.equal(item.est, 210, '3360000 bytes of mp3 at ~128 kbps is 210 seconds');
  assert.ok(item.audio?.endsWith('.mp3'), 'and the tape itself is still there to roll');
});

// The estimate must never shadow a real duration: an item the feed timed is not a gamble,
// and Block.est (which is what makes score() apply drift) keys on est being present.
test('a document with a real duration never gets an estimate', () => {
  const item = toWireItem(doc, 'satellite', 'Morning Edition');
  assert.equal(item.est, undefined);
  assert.ok(item.len > 0);
});
