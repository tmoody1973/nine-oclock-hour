'use client';
import { useEffect, useRef, useState } from 'react';
import type { PlayItem } from '@/lib/playlist';

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
// which is a READ with no audio of its own — toPlaylist([LEGAL_ID]) yields an entry whose
// `audio` is undefined — and cue() correctly pauses for a read and never calls play(). So the
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
// The first block is the legal ID, a read, silent by design, so hearing nothing for ~60s is
// expected and proves nothing either way. WATCH THE BUTTON, not the audio. Success: it still
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

export function Player({ list, station, onDone }: { list: PlayItem[]; station: string; onDone?: () => void }) {
  // One element for the session. iOS unlocks audio on the element the user tapped;
  // creating a new one per track loses that unlock and playback silently stops.
  const el = useRef<HTMLAudioElement>(null);
  const next = useRef<HTMLAudioElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const item = list[i];

  useEffect(() => {
    const a = el.current;
    if (!a || !item) return;
    // Warm the next file FIRST. This line used to sit below the branch, where a spoken read's
    // `return () => clearTimeout(t)` exited the effect before reaching it — so the track after
    // every read started cold. Reads are 30 seconds; an un-warmed mp3 on a phone is exactly
    // where a gap opens in the hour. Traced through the real control flow, not spotted by eye.
    if (next.current && list[i + 1]?.audio) next.current.src = list[i + 1].audio!;
    cue(a, item, playing, () => setPlaying(false));
    // A read has no audio of its own, so the hour is carried forward by a timer instead.
    if (!item.audio && playing) { const t = setTimeout(() => setI((n) => n + 1), item.seconds * 1000); return () => clearTimeout(t); }
  }, [i, playing, item, list]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.src, album: `${station} · the nine o'clock hour` });
    navigator.mediaSession.setActionHandler('nexttrack', () => setI((n) => Math.min(n + 1, list.length - 1)));
    navigator.mediaSession.setActionHandler('previoustrack', () => setI((n) => Math.max(n - 1, 0)));
    // Clear them on unmount. Without this the lock screen keeps this hour's title and its
    // next/previous buttons after the player is gone, and those buttons call into a component
    // that no longer exists.
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
    };
  }, [item, list.length, station]);

  // The hour has run out. Say so in an effect rather than during render — the page needs this
  // to swap the player for the aircheck.
  //
  // The latch is not belt-and-braces. `onDone` is in the dependency array, so a parent passing
  // an inline arrow — which is exactly what Task 8 does — hands this effect a fresh dependency
  // on every parent render. Without the latch, once the hour has ended ANY unrelated re-render
  // of the page would call `onDone` again. Harmless for `setDone(true)`, wrong for anything
  // that counts. Re-arming on `item` matters too: a listener who builds a second hour must get
  // a second ending.
  const doneFired = useRef(false);
  useEffect(() => {
    if (item) { doneFired.current = false; return; }
    if (list.length && !doneFired.current) { doneFired.current = true; onDone?.(); }
  }, [item, list.length, onDone]);

  if (!item) return null;
  return (
    <section aria-label="Player">
      <audio ref={el} onEnded={() => setI((n) => n + 1)} preload="none" />
      <audio ref={next} preload="auto" style={{ display: 'none' }} />
      {/* The tap itself starts the audio, synchronously, via toggle(). iOS permits playback to
          begin only from inside the gesture, and the first tap is what unlocks this element for
          the rest of the session; a React effect runs after paint, in a later task, which is
          outside it. Flipping `playing` and leaving the effect to start playback means there is
          no play() inside a gesture at all — so the element is never unlocked, and every later
          effect-driven play() is refused too. Silent on iPhone, for the whole hour.

          toggle() goes through cue() rather than a direct a.play()/a.pause(), so the read check
          a direct call used to bypass stays on this path; and it plays five ms of silence first
          when the current item is a read, because the hour always opens on one and cue() will
          only pause for it. The effect above still calls cue() for every other reason the track
          changes — by then the element is unlocked and no fresh gesture is needed. */}
      <button onClick={() => {
        const a = el.current;
        if (!a) return;
        setPlaying(toggle(a, item, playing, () => setPlaying(false)));
      }}>
        {playing ? 'Pause' : 'Play my hour'}
      </button>
      <p>{item.title} — {item.src}{item.audio ? '' : ' (read)'}</p>
      <p>{i + 1} of {list.length}</p>
    </section>
  );
}
