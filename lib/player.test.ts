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

// CHARACTERISATION, not a guard — and the distinction is the point. The bug it describes was
// in <Player>'s button, which called a.play()/a.pause() directly on the DOM node and so had no
// idea the current item was a read: resuming during a 30-second read momentarily replayed
// whatever tape had been rolling before it. The FIX was to route the button through cue().
//
// This test cannot prove that fix. It exercises cue() alone, which has always behaved this
// way, so it was green before the button changed and is green after — it would pass just as
// happily against a button that still bypassed cue() entirely. There is no React harness in
// this build (see the file header), so nothing here can reach the button. What it does earn
// its place doing is pinning cue()'s half of the contract: if cue() is ever loosened to touch
// src or start playback for an item with no audio of its own, this goes red.
test('CHARACTERISATION: cue() on a read never plays or touches src, whatever the element still holds', () => {
  const { el, calls } = stubAudio();
  el.src = 'https://npr.example/previous-tape.mp3';
  cue(el, item({ id: 'a2:read', audio: undefined, seconds: 30 }), true, () => {});
  assert.deepEqual(calls, ['pause'], 'resuming a read must only ever pause, never play');
  assert.equal(el.src, 'https://npr.example/previous-tape.mp3', 'a read must never touch src');
});

// THE INVARIANT THAT LETS THE PLAY BUTTON START AUDIO INSIDE THE TAP. iOS only permits audio
// to start from within the gesture, and the first tap is what unlocks audio for the whole
// session — so <Player>'s button calls cue() synchronously in its onClick. The track effect
// then re-runs (React defers it until after paint) and calls cue() a second time with the same
// item. Assigning to a real HTMLAudioElement's `src` invokes the media load algorithm EVERY
// time, even with an identical URL: it resets currentTime to 0 and aborts any play() already
// in flight. Unguarded, that second cue() would abort the play() the tap just started, and on
// iOS the retry lands outside the gesture and is refused. The same guard also stops pause and
// resume from restarting the current track from zero.
function stubAudioCountingSrc() {
  const calls: string[] = [];
  let src = '';
  const el = {
    get src() { return src; },
    set src(v: string) { src = v; calls.push(`src=${v}`); },
    play: async () => { calls.push('play'); },
    pause: () => { calls.push('pause'); },
  };
  return { el, calls };
}

test('re-cueing the track already loaded never reassigns src — that would restart it mid-tap', () => {
  const { el, calls } = stubAudioCountingSrc();
  const track = item();
  cue(el, track, true, () => {});   // the click handler, inside the tap
  assert.deepEqual(calls, [`src=${track.audio}`, 'play'], 'the first cue loads it and starts it');
  calls.length = 0;
  cue(el, track, true, () => {});   // the effect, re-running after paint with the same item
  assert.ok(!calls.some((c) => c.startsWith('src=')), 'src must not be reassigned for the track already loaded');
  assert.deepEqual(calls, ['play'], 'it may only ensure playback, which is a no-op on an element already playing');
});

test('a genuinely different track still gets loaded — the guard must not freeze the hour', () => {
  const { el, calls } = stubAudioCountingSrc();
  cue(el, item(), true, () => {});
  calls.length = 0;
  cue(el, item({ id: 'b:tape', audio: 'https://npr.example/b.mp3' }), true, () => {});
  assert.deepEqual(calls, ['src=https://npr.example/b.mp3', 'play']);
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
