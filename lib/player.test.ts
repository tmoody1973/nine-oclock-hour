// Tests the element-driving half of <Player>'s track effect. Lives under lib/ because
// `pnpm test` only globs lib/**/*.test.ts — same reason as lib/audition.test.ts — and there
// is no React test harness in this build, so the effect's decision is exported as `cue` and
// run here against a stub element rather than a rendered component.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cue } from '../components/Player';
import type { PlayItem } from './playlist';

const item = (over: Partial<PlayItem> = {}): PlayItem =>
  ({ id: 'a1:tape', title: 'The Fed holds rates', src: 'Morning Edition', seconds: 214, audio: 'https://npr.example/a1.mp3', ...over });

// A stub element that records what was done to it, in order. Only the three members `cue`
// touches — no jsdom, no DOM at all.
function stubAudio() {
  const calls: string[] = [];
  const el = {
    src: '',
    play: async () => { calls.push('play'); },
    pause: () => { calls.push('pause'); },
  };
  return { el, calls };
}

// THE BUG THIS FILE EXISTS FOR. Skipping forward (the lock-screen "next" button) from a
// playing tape onto a 30-second read left the element untouched: a read has no audio, so
// nothing reassigned `src` and nothing stopped it. The previous tape carried on playing
// underneath a read the listener was supposed to be hearing in silence.
test('cueing a read pauses the element — the previous tape must not play on underneath it', () => {
  const { el, calls } = stubAudio();
  cue(el, item({ id: 'a2:read', audio: undefined, seconds: 30 }), true, () => {});
  assert.ok(calls.includes('pause'), 'a read with no audio must stop whatever was rolling');
  assert.ok(!calls.includes('play'), 'and must never start playback of its own');
});

test('a read pauses the element even when the hour is not running', () => {
  const { el, calls } = stubAudio();
  cue(el, item({ audio: undefined }), false, () => {});
  assert.deepEqual(calls, ['pause']);
});

test('a track with tape is cued onto the same element and rolls when the hour is running', () => {
  const { el, calls } = stubAudio();
  cue(el, item({ audio: 'https://npr.example/next.mp3' }), true, () => {});
  assert.equal(el.src, 'https://npr.example/next.mp3', 'one element for the session — iOS unlocks the element the listener tapped');
  assert.deepEqual(calls, ['play']);
});

// cue() has to fully own both directions, not just "start playing" — the manual Play/Pause
// button used to call a.pause()/a.play() on the DOM node itself for this exact case (toggling
// the SAME track), which is the bypass the next test is about. Once the button only flips
// `playing` and leaves the element to cue(), pausing an actively-rolling tape has nowhere
// else to happen, so cue() must call pause() itself rather than assume the element is already
// stopped.
test('a track with tape is loaded but not started while the hour is paused', () => {
  const { el, calls } = stubAudio();
  cue(el, item(), false, () => {});
  assert.equal(el.src, 'https://npr.example/a1.mp3');
  assert.deepEqual(calls, ['pause']);
});

// THE OTHER BUG THIS FILE EXISTS FOR. The manual Play/Pause button called a.play()/a.pause()
// directly on the DOM node, bypassing cue() — so resuming during a 30-second read (cue()
// never touches `src` for a read) momentarily replayed whatever tape had been rolling before
// the read, because the direct a.play() call had no idea the current item was a read. Once
// the button routes every toggle through cue() instead, "resume during a read" is just
// cue(el, sameReadItem, true, ...) — and that must never touch src or start playback,
// regardless of what the element is still holding from before.
test('resuming during a read never plays or touches src, even though the element still holds the previous tape', () => {
  const { el, calls } = stubAudio();
  el.src = 'https://npr.example/previous-tape.mp3';
  cue(el, item({ id: 'a2:read', audio: undefined, seconds: 30 }), true, () => {});
  assert.deepEqual(calls, ['pause'], 'resuming a read must only ever pause, never play');
  assert.equal(el.src, 'https://npr.example/previous-tape.mp3', 'a read must never touch src');
});

// play() rejects on its own whenever the browser refuses (an autoplay policy, a lost iOS
// unlock). The player's answer is to drop back to a paused state rather than sit there
// claiming to be playing, so the rejection has to reach the caller's handler.
test('a refused play() reports back rather than throwing into the effect', async () => {
  const calls: string[] = [];
  let reported = false;
  const el = { src: '', play: async () => { calls.push('play'); throw new Error('NotAllowedError'); }, pause: () => { calls.push('pause'); } };
  cue(el, item(), true, () => { reported = true; });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reported, true);
});
