import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlaylist } from './playlist';

test('items without tape stay in the playlist as cards, not as audio', () => {
  const list = toPlaylist([
    { id: 'a', label: 'With tape', len: 120, audio: 'https://example.org/a.mp3', how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news' },
    { id: 'b', label: 'A read', len: 30, how: 'ours', kind: 'seg', mode: 'read', topic: 'local' },
  ]);
  assert.equal(list.length, 2);
  assert.equal(list[1].audio, undefined);
  assert.equal(list[1].seconds, 30);
});

// These three guard a RIGHTS rule, not a preference, so they are written to fail if the
// `how` check is ever removed. An earlier draft used `mode: 'read'` here — which passes
// whether or not the guard exists, because `mode !== 'tape'` short-circuits before `how` is
// ever looked at. Deleting the guard would have streamed another station's audio out of our
// player with nothing going red. Every case below therefore uses `mode: 'tape'`.
test("another station's tape is a card, never a stream", () => {
  const list = toPlaylist([{ id: 'c', label: 'Theirs', len: 200, audio: 'https://kcrw.example/x.mp3', how: 'station', kind: 'seg', mode: 'tape', topic: 'local' }]);
  assert.equal(list[0].audio, undefined, 'display-only: link out, never stream it ourselves');
});

test('podcast audio is not cleared for broadcast', () => {
  const list = toPlaylist([{ id: 'p', label: 'Pod', len: 200, audio: 'https://pod.example/x.mp3', how: 'podcast', kind: 'seg', mode: 'tape', topic: 'culture' }]);
  assert.equal(list[0].audio, undefined);
});

test('network and our own tape DO stream — the guard must not block everything', () => {
  const list = toPlaylist([
    { id: 'n', label: 'Net', len: 200, audio: 'https://npr.example/n.mp3', how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news' },
    { id: 'o', label: 'Ours', len: 200, audio: 'https://ours.example/o.mp3', how: 'ours', kind: 'seg', mode: 'tape', topic: 'local' },
  ]);
  assert.equal(list[0].audio, 'https://npr.example/n.mp3');
  assert.equal(list[1].audio, 'https://ours.example/o.mp3');
});
