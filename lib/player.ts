// The audio rules, with no React and no DOM in them. This lives in lib/ rather than beside
// the component for one hard reason: lib/player.test.ts runs under `node --test`, which cannot
// parse the CSS module the component imports, so a test that reaches through components/Player
// cannot load at all. Everything here is the part worth testing anyway — what to do to the
// element, and how far into a block we are — and this is where the rest of this build keeps
// logic of that shape (lib/clock.ts, lib/hour.ts).
//
// READ THE COMMENTS BEFORE CHANGING ANY OF IT. The iOS unlock has been broken twice, and each
// time it cost every iPhone the whole session's audio, silently.
import type { PlayItem } from './playlist';

// Only the three members `cue` touches, so a test can hand it a plain object instead of a
// real DOM element — there is no React test harness in this build (see lib/player.test.ts).
type CueTarget = { src: string; play: () => Promise<void>; pause: () => void };

// Point the session's one audio element at the track now playing. Exported so the decision
// can be tested without rendering a component.
export function cue(a: CueTarget, item: PlayItem, playing: boolean, onRefused: () => void): void {
  // A read has no audio of its own, and the element must be STOPPED before one starts, not
  // merely left alone. Nothing else reassigns `src` on this path: skipping forward onto a
  // read (the lock-screen "next" button) used to leave the previous tape rolling underneath
  // a read the listener was supposed to hear in silence. Natural end-of-track never showed
  // it — the element has already stopped itself by then — which is why it survived so long.
  if (!item.audio) { a.pause(); return; }
  // Only when it actually changes. Assigning `src` invokes the media load algorithm every
  // time, even with an identical URL: currentTime resets to 0 and any play() already in
  // flight is aborted. The Play button below calls cue() synchronously inside the tap — iOS
  // permits audio to start only there, and the first tap is what unlocks it for the whole
  // session — and the track effect then re-runs after paint and cues the same item again.
  // Unguarded, that second call would abort the play() the tap just started and retry it
  // outside the gesture, where iOS refuses it: no audio on iPhone, ever. It also stops pause
  // and resume restarting the current track from the top.
  //
  // Load-bearing assumption, and NOT the one an earlier draft of this comment named. The
  // hazard is not a relative URL — both writers are absolute (lib/cds.ts's enclosure href,
  // lib/reads.ts's blob.put().url). It is NORMALISATION: the `src` getter returns the resolved,
  // re-encoded form, so an href carrying an uppercase character in the host (hosts are
  // lowercased), an explicit `:443`, a literal space, a non-ASCII character, or any of
  // " < > ` { } comes back changed and never compares equal. CDS hrefs are publisher-controlled,
  // so that is live-data risk rather than code risk.
  //
  // What it costs is smaller than "no audio ever", and worth stating so nobody over-corrects:
  // the iOS unlock SURVIVES, because toggle() calls play() inside the tap regardless of this
  // guard. What breaks is everything after — each effect re-run reassigns `src`, aborts the
  // in-flight play(), and the AbortError reaches onRefused, which pauses. Tap, a fraction of a
  // second, button resets, repeat. That ONE story is unplayable, silently and for good, on
  // every platform — it reproduces in desktop Chrome, it is not an iOS story.
  //
  // Measured 2026-09-16 against the captured CDS response: all 79 absolute hrefs round-trip
  // byte-for-byte through the WHATWG parser, so this is latent, not live. If it ever fires,
  // the fix is one line here:
  //     const wanted = new URL(item.audio).href;
  //     if (a.src !== wanted) a.src = item.audio;
  if (a.src !== item.audio) a.src = item.audio;
  if (playing) void a.play().catch(onRefused);
  else a.pause();
}

// Five milliseconds of silence, in the same container this app already produces for its reads
// (16-bit PCM, 24kHz, mono — see pcmToWav in lib/reads.ts). It exists to be PLAYED, never heard.
//
// iOS grants an element permission to play only when play() is invoked from inside a user
// gesture, and grants it to the element that gesture touched. Every hour opens on the legal ID,
// and for a station with no confirmed wording on file that block is a READ with no audio of its
// own — toPlaylist() yields an entry whose `audio` is undefined — and cue() correctly pauses for a
// read and never calls play(). (A station whose identification IS recorded opens on real audio, so
// the tape itself is the gesture's play() and no silence is spent. Both paths must work.) So the
// listener's first tap would invoke play() nowhere at all, the element would stay locked for
// the whole session, and the first real tape sixty seconds later would be refused outside any
// gesture. Every effect-driven play() after it fails for the same reason: not one glitchy
// transition, the entire hour, silently. Worse, cue()'s onRefused flips the button back to
// "Play my hour", so the listener taps again, takes the same deferred path, and is refused
// again — a button that looks responsive and never plays anything.
//
// Playing a few bytes of silence is the unlock, because it is a real play() on the real
// element inside the real gesture.
const SILENT_WAV = 'data:audio/wav;base64,UklGRhQBAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// PRE-DEPLOY, ON A REAL IPHONE. This is the one link in the chain that is reasoning rather than
// observation: that iOS grants the unlock for a `data:` URI of silence. It is the standard
// technique, but nothing in this repo can settle it. The check, and the obvious version of it
// passes while proving nothing — open a normal hour, tap Play ONCE, then do not touch the screen.
// The first block is the legal ID. On a station with no confirmed wording it is silent by design,
// so hearing nothing for ~60s is expected and proves nothing either way; on a station whose
// identification is recorded you will hear it, and that ALSO proves nothing about the unlock.
// EITHER WAY, WATCH THE BUTTON, not the audio — the button is the only signal that distinguishes
// a granted unlock from a refused one. Test the silent case if you can: it is the harder path. Success: it still
// reads "Pause" at the end of that minute and the first tape rolls on its own. Failure: it flips
// back to "Play my hour" at any point, and no tape ever rolls. Do not tap twice — a second tap is
// a fresh gesture and masks exactly the failure being tested.
export function unlock(a: CueTarget): void {
  a.src = SILENT_WAV;
  // Swallowed deliberately. If the browser refuses even this there is nothing to fall back to
  // and nothing to tell the listener yet: the read airs on its timer either way, and the first
  // real track's own play() reports the refusal through onRefused.
  void a.play().catch(() => {});
}

// What the Play/Pause button does, extracted so it can be tested without rendering a component
// — the same reason cue() is exported (there is no React harness in this build). Returns the
// `playing` state the caller should move to.
//
// The entire point is that this runs SYNCHRONOUSLY inside the click handler. React defers
// effects until after paint, in a later task, which is outside the gesture window. Pausing,
// natural track transitions and the lock-screen skip can all keep flowing through cue() from
// the effect, because those act on an element the first tap has already unlocked — but that
// first tap has to spend itself on a real play() or there is nothing to inherit.
export function toggle(a: CueTarget, item: PlayItem, playing: boolean, onRefused: () => void): boolean {
  const next = !playing;
  // Starting the hour on an item with no audio of its own — which is every hour, since the
  // legal ID opens it. cue() below will correctly only pause, so this is the one chance to
  // spend the gesture on an actual play() call.
  if (next && !item.audio) unlock(a);
  cue(a, item, next, onRefused);
  return next;
}

// ── How far into a block we are ───────────────────────────────────────────────────────────
// A block WITH tape has real media time: the element counts `currentTime` against `duration`
// and the browser owns it. A READ has none of that — no media element state at all, because
// cue() deliberately never gives a read a source — so the only clock it has is the wall clock,
// and the arithmetic below is the whole of it. Every hour opens on one: the 60-second legal ID,
// silent by design, which is exactly the screen that read as "nothing is happening, no play, no
// audio" four separate times in twenty minutes (docs/roadmap.md, gap 1).
//
// Why this is not simply `Date.now() - startedAt`: the listener can pause. `spent` is the
// seconds already aired and settled; `since` is when the current run began, or null while
// paused; nothing else is remembered. Pausing folds the open run into `spent`, resuming opens a
// new one. So a legal ID paused at 0:55 and resumed ten minutes later still owes the hour five
// seconds and says so, where a start-time-only clock would insist the minute was long gone.
export type ReadClock = { spent: number; since: number | null };
export const CLOCK_IDLE: ReadClock = { spent: 0, since: null };

export function clockElapsed(c: ReadClock, now: number): number {
  return c.since === null ? c.spent : c.spent + (now - c.since) / 1000;
}

// Start or stop the clock to match whether the hour is running. Returns the SAME object when it
// is already in that state, which is load-bearing rather than tidy: the track effect below
// re-runs on several dependencies and assigns this back unconditionally, so handing out a fresh
// object for an unchanged state would reopen `since` on every pass and keep resetting the read
// to zero.
export function runClock(c: ReadClock, running: boolean, now: number): ReadClock {
  if (running === (c.since !== null)) return c;
  return running ? { spent: c.spent, since: now } : { spent: clockElapsed(c, now), since: null };
}

// What the read still owes the hour, in seconds. Clamped at zero because this arms the
// setTimeout that carries the hour past a read — a negative delay fires immediately — and
// because it is also the number on screen, which must never count below 0:00.
export function readLeft(item: PlayItem, c: ReadClock, now: number): number {
  return Math.max(0, item.seconds - clockElapsed(c, now));
}



// mm:ss. Rounds the WHOLE value before splitting, so 59.5s reads 1:00 rather than 0:60.
// Rounding only the seconds part is what five other copies of this helper still do; they are
// fed whole rundown lengths where Math.round is a no-op. The player is the first caller to hand
// it real playback time — a float, sampled four times a second — which is what made a two-week-old
// latent bug reachable on the most visible number in the app.
export const clock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

// Where the hour stands. Blocks already aired count at their SCHEDULED length — what the rundown
// promised — and only the block now playing counts at its real position.
export const hourElapsed = (list: PlayItem[], i: number, into: number): number =>
  list.slice(0, i).reduce((n, x) => n + x.seconds, 0) + Math.min(into, list[i]?.seconds ?? 0);
// Capped at the block's scheduled length deliberately. A block that runs long — the rundown says
// 4:40, the file is really 5:14 — would otherwise push this past where the next block's base
// begins, and the readout would jump BACKWARDS 34 seconds the moment that block ended. The cost
// is that the hour clock pauses during an overrun; a stalled clock reads as honest, a reversing
// one reads as broken.
