// Tests the element-driving half of <Player>'s track effect. Lives under lib/ because
// `pnpm test` only globs lib/**/*.test.ts — same reason as lib/audition.test.ts — and there
// is no React test harness in this build, so the effect's decision is exported as `cue` and
// run here against a stub element rather than a rendered component. The logic itself lives in
// lib/player.ts, not beside the component: node cannot parse the CSS module <Player> imports.
import { test } from 'node:test';
import type { PlayItem } from './playlist';
import assert from 'node:assert/strict';
import { cue, toggle, clock, hourElapsed } from './player';

const item = (over: Partial<PlayItem> = {}): PlayItem =>
  ({ id: 'a1:tape', title: 'The Fed holds rates', src: 'Morning Edition', seconds: 214, mode: 'tape', audio: 'https://npr.example/a1.mp3', ...over });

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

// THE FIRST TAP, AND WHY IT IS A SPECIAL CASE. Every hour opens on the legal ID, a READ with
// no audio of its own — checked against the real constant, not assumed: toPlaylist([LEGAL_ID])
// yields an entry whose `audio` is undefined. cue() correctly pauses for a read and never calls
// play(). So without an unlock the listener's first tap invokes play() NOWHERE, the element is
// never unlocked, and the first real tape sixty seconds later is refused outside any gesture —
// as is every effect-driven play() after it. cue()'s onRefused then flips the button back to
// "Play my hour", so tapping again takes the same path and is refused again.
test('the first tap on a read still calls play() on the element — that is what unlocks iOS', () => {
  const { el, calls } = stubAudioCountingSrc();
  const legalId = item({ id: 'legalid', audio: undefined, seconds: 60 });
  assert.equal(toggle(el, legalId, false, () => {}), true, 'the hour is now running');
  assert.ok(calls.includes('play'), 'play() must be invoked inside the gesture, or the session never unlocks');
  assert.ok(calls.some((c) => c.startsWith('src=data:audio/wav')), 'and play() needs a source — five ms of silence');
  assert.equal(calls[calls.length - 1], 'pause', 'the read itself still airs in silence');
});

test('the first tap on a track WITH tape unlocks by playing the tape itself, no silence needed', () => {
  const { el, calls } = stubAudioCountingSrc();
  const track = item();
  assert.equal(toggle(el, track, false, () => {}), true);
  assert.deepEqual(calls, [`src=${track.audio}`, 'play'], 'the real track IS the gesture play()');
  assert.ok(!calls.some((c) => c.includes('data:audio/wav')), 'no silent clip when there is real audio to start');
});

// Pausing needs no gesture credit, and must not go anywhere near the unlock: spending a src
// assignment on silence here would throw away the track the listener is halfway through.
test('pausing never unlocks — the silent clip is only ever for starting the hour', () => {
  const { el, calls } = stubAudioCountingSrc();
  assert.equal(toggle(el, item({ audio: undefined }), true, () => {}), false);
  assert.deepEqual(calls, ['pause']);
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

// ── The read clock ────────────────────────────────────────────────────────────────────────
// A READ has no media of its own — no currentTime, no duration, nothing the browser counts —
// so the ONLY clock it has is the wall clock. Every hour opens on one: the 60-second legal ID,
// silent by design, which is what made the whole app look dead four separate times in twenty
// minutes (docs/roadmap.md, gap 1). These tests pin the half of that which is arithmetic; the
// wiring into <Player> is browser-verified, since there is no React harness in this build.
import { CLOCK_IDLE, clockElapsed, runClock, readLeft } from './player';

const legalId = (): PlayItem => item({ id: 'legalid', title: 'Legal ID and promo', audio: undefined, seconds: 60 });

test('a read that has not started yet reads zero, with the whole minute still to come', () => {
  assert.equal(clockElapsed(CLOCK_IDLE, 1_000), 0);
  assert.equal(readLeft(legalId(), CLOCK_IDLE, 1_000), 60);
});

test('a running read counts up against its own length, not against any media', () => {
  const started = runClock(CLOCK_IDLE, true, 1_000);
  assert.equal(clockElapsed(started, 21_000), 20, 'twenty seconds of wall clock is twenty seconds of read');
  assert.equal(readLeft(legalId(), started, 21_000), 40);
});

// THE ONE THAT MATTERS. Paused, the number must FREEZE — not keep counting toward an end that
// is not coming, which is the "stuck at 3 of 30" reading of a screen that is actually fine.
test('a paused read stops counting, however long the listener leaves it', () => {
  const paused = runClock(runClock(CLOCK_IDLE, true, 1_000), false, 21_000);
  assert.equal(clockElapsed(paused, 21_000), 20);
  assert.equal(clockElapsed(paused, 600_000), 20, 'ten minutes paused is still twenty seconds aired');
  assert.equal(readLeft(legalId(), paused, 600_000), 40, 'and forty seconds still owed to the hour');
});

// And resuming must not start the minute again. This is the bug the wiring below it fixes:
// <Player> used to arm setTimeout(item.seconds * 1000) on every resume, so a legal ID paused
// at 0:55 aired for another full sixty seconds — the bar and the block would disagree, and the
// bar would be the one telling the truth.
test('resuming picks up where it left off — a read never airs its minute twice', () => {
  const paused = runClock(runClock(CLOCK_IDLE, true, 1_000), false, 56_000);   // 55s aired
  const resumed = runClock(paused, true, 300_000);                             // back, much later
  assert.equal(clockElapsed(resumed, 300_000), 55, 'the pause itself costs the hour nothing');
  assert.equal(readLeft(legalId(), resumed, 303_000), 2, 'three more seconds aired, two to go');
  assert.equal(readLeft(legalId(), resumed, 305_000), 0, 'and it ends on time, not sixty seconds late');
});

test('a read that has over-run owes the hour nothing — never a negative countdown', () => {
  const overrun = runClock(CLOCK_IDLE, true, 1_000);
  assert.equal(readLeft(legalId(), overrun, 90_000), 0);
});

// <Player> assigns runClock()'s result back on every pass of its track effect, which re-runs
// on several dependencies. Handing back a fresh object for an unchanged state would restart
// `since` each time and quietly reset the read to zero over and over.
test('runClock hands back the very same clock when nothing has changed', () => {
  const running = runClock(CLOCK_IDLE, true, 1_000);
  assert.equal(runClock(running, true, 9_000), running, 'still running — nothing to settle');
  assert.equal(runClock(CLOCK_IDLE, false, 9_000), CLOCK_IDLE, 'still paused — nothing to start');
});


// A block that runs long is normal: the rundown says 4:40, the file is really 5:14. The hour
// readout must never go BACKWARDS when that block ends — a clock ticking backwards reads as
// broken worse than one that stalls.
test('the hour clock never runs backwards when a block overruns its scheduled length', () => {
  const list: PlayItem[] = [item({ id: 'a', seconds: 280 }), item({ id: 'b', seconds: 120 })];
  const atOverrun = hourElapsed(list, 0, 314);   // still on block A, 34s past its schedule
  const justAfter = hourElapsed(list, 1, 0);     // block A done, block B just started
  assert.ok(justAfter >= atOverrun, `hour clock went backwards: ${atOverrun} -> ${justAfter}`);
  assert.equal(atOverrun, 280, 'an overrunning block is capped at what the rundown promised');
});

// Fed a float in [59.5, 60) the seconds round to 60 instead of carrying into the minute.
test('the clock carries into the minute instead of printing :60', () => {
  assert.equal(clock(59.5), '1:00');
  assert.equal(clock(59.9), '1:00');
  assert.equal(clock(299.7), '5:00');
  assert.equal(clock(3599.6), '60:00');
});

test('the clock still formats the ordinary cases', () => {
  assert.equal(clock(0), '0:00');
  assert.equal(clock(59.4), '0:59');
  assert.equal(clock(60), '1:00');
  assert.equal(clock(314), '5:14');
});

// ─── The first tap, now that the opening block can carry audio ────────────────────────────
// Giving the legal ID a recording CHANGES THE UNLOCK PATH, which is the part of this that can
// cost every iPhone the whole session. toggle() plays five milliseconds of silence only because
// the opening block has no audio of its own; when it has some, the recording itself is the
// gesture's play() and no silent clip is needed. Both of those must still start playback inside
// the tap — a station with a recording, and a station without one. Run against the real block
// builder and the real playlist, not a hand-made item, so the whole chain is what is tested.
import { legalIdBlock } from './wire';
import { toPlaylist } from './playlist';

test('a station WITH a recorded legal ID unlocks on the recording itself — no silent clip', () => {
  const { el, calls } = stubAudioCountingSrc();
  const [entry] = toPlaylist([legalIdBlock({ legalId: 'https://blob.example/ids/wyms.wav' })]);
  assert.equal(toggle(el, entry, false, () => {}), true, 'the hour is now running');
  assert.deepEqual(calls, ['src=https://blob.example/ids/wyms.wav', 'play'], 'the identification IS the gesture play()');
  assert.ok(!calls.some((c) => c.includes('data:audio/wav')), 'no five ms of silence when there are real words to say');
});

test('a station with NO confirmed wording still unlocks, exactly as it does today', () => {
  const { el, calls } = stubAudioCountingSrc();
  const [entry] = toPlaylist([legalIdBlock({})]);
  assert.equal(entry.audio, undefined, 'nobody has given us the words, so there is nothing to play');
  assert.equal(toggle(el, entry, false, () => {}), true);
  assert.ok(calls.some((c) => c.startsWith('src=data:audio/wav')), 'silence is the only thing left to spend the gesture on');
  assert.ok(calls.includes('play'), 'and play() must still happen inside the tap, or the session never unlocks');
  assert.equal(calls[calls.length - 1], 'pause', 'the block itself still airs in silence');
});

// The windows are now IN the list (lib/wire.ts, airBlocks), which means the hour readout counts
// them and the "N of M" beside it includes them. Both are the fix, not a regression — the played
// hour used to be 90 seconds shorter than the rundown it claimed to be playing. But it puts a
// new kind of block under the same cap as the test above, and the weather window is the one
// block whose audio length is decided by a text-to-speech model rather than by us: a 45-second
// window holding a 48-second forecast is entirely possible. So the same guarantee is pinned for
// a window, with real numbers: the clock stalls at what the rundown promised, and never reverses.
test('the hour clock never runs backwards when a weather window overruns its 45 seconds', () => {
  const list: PlayItem[] = [
    item({ id: 'legalid', seconds: 60, audio: undefined, mode: 'read' }),
    item({ id: 'wx', title: 'Weather window', seconds: 45, mode: 'read', audio: 'https://blob.example/wx/today.wav' }),
    item({ id: 'b', seconds: 120 }),
  ];
  const atOverrun = hourElapsed(list, 1, 48);   // the recording ran three seconds long
  const justAfter = hourElapsed(list, 2, 0);    // the window is over, the next block starts
  assert.ok(justAfter >= atOverrun, `hour clock went backwards: ${atOverrun} -> ${justAfter}`);
  assert.equal(atOverrun, 105, 'capped at the 60-second ID plus the 45 the window was given');
  assert.equal(justAfter, 105, 'and the next block picks up from exactly there');
});

// A SILENT window cannot overrun at all — it has no media, so its position comes from the read
// clock, which readLeft() clamps at zero and the render caps at the block's scheduled length.
test('a silent window counts exactly the seconds the rundown gave it', () => {
  const list: PlayItem[] = [item({ id: 'tx', title: 'Traffic window', seconds: 45, mode: 'read', audio: undefined }), item({ id: 'b', seconds: 120 })];
  assert.equal(hourElapsed(list, 0, 45), 45);
  assert.equal(hourElapsed(list, 1, 0), 45, 'no jump, no gap');
});

// ─── Silent blocks do not occupy listening time ───────────────────────────────────────────
// The decision (docs/decisions/004): when a block has no audio of its own, the hour does not
// wait out its slot on the clock — it moves straight on. Traffic and weather windows with no
// recording, a legal ID with no confirmed wording, and every music bed are all this block.
// So the hour must never LAND on one: landOn() is where a move actually ends up, and it is
// the single place that knows it, because <Player>'s go() is the one way the hour moves.
import { landOn } from './player';

const silent = (id: string, seconds = 45): PlayItem => item({ id, audio: undefined, seconds, mode: 'read' });
const heard = (id: string): PlayItem => item({ id, audio: `https://npr.example/${id}.mp3` });

test('a block with audio of its own is where the move lands — nothing to skip', () => {
  const list = [silent('legalid', 60), heard('a'), heard('b')];
  assert.equal(landOn(list, 1, 0), 1);
});

test('travelling forward, the hour walks past silence to the next thing it can play', () => {
  const list = [silent('legalid', 60), silent('wx'), silent('tx'), heard('a')];
  assert.equal(landOn(list, 0, 0), 3, 'the opening silence is not listening time');
  assert.equal(landOn(list, 1, 0), 3, 'and neither are the two windows behind it');
});

// The end of the hour, which <Player> reads as "no item" and turns into the aircheck. Without
// this an hour that trails off into silence would sit on the last silent block for ever.
test('an hour that ends in silence runs off the end rather than resting on it', () => {
  const list = [heard('a'), silent('bed', 180), silent('tx')];
  assert.equal(landOn(list, 1, 0), 3, 'past the end is the end of the hour');
});

test('an hour with nothing to play at all is over the moment it starts', () => {
  const list = [silent('legalid', 60), silent('wx'), silent('bed', 180)];
  assert.equal(landOn(list, 0, 0), 3);
});

// Back has to walk the other way, or it is a dead button: pressing it from the first newscast
// would land on the silent legal ID and be thrown forward onto the newscast again.
test('travelling back, the hour walks BACKWARDS past silence', () => {
  const list = [heard('a'), silent('wx'), silent('tx'), heard('b')];
  assert.equal(landOn(list, 2, 3), 0, 'back from the second newscast reaches the first');
});

// And when there is nothing audible behind, -1 says so: the caller stays where it is, and the
// Back button beside it is disabled rather than enabled and inert.
test('back past the opening silence has nowhere to land and says so', () => {
  const list = [silent('legalid', 60), silent('wx'), heard('a')];
  assert.equal(landOn(list, 1, 2), -1);
});

// The lead's standing invariant, re-checked under skipping: the index now moves in jumps, so
// the hour readout's base jumps with it. It must still only ever go forwards.
test('the hour clock still never runs backwards when silence is skipped over', () => {
  const list = [silent('legalid', 60), silent('wx'), heard('a')];
  const before = hourElapsed(list, 0, 0);
  const after = hourElapsed(list, landOn(list, 0, 0), 0);
  assert.ok(after >= before, `hour clock went backwards: ${before} -> ${after}`);
  assert.equal(after, 105, 'the skipped minute and the skipped window are behind us on the rundown');
});
