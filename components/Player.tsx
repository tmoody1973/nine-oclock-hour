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
  // Load-bearing assumption: every audio URL here is absolute (a CDS enclosure href or a
  // Vercel Blob href), so a real element's `src` getter returns the same string that was
  // assigned to it. A relative URL would resolve, never compare equal, reassign on every
  // cue, and quietly put the iOS gesture chain back the way it was.
  if (a.src !== item.audio) a.src = item.audio;
  if (playing) void a.play().catch(onRefused);
  else a.pause();
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
      {/* The tap itself starts the audio. iOS permits playback to begin only from inside the
          gesture, and the first tap is what unlocks audio for the rest of the session; a React
          effect runs after paint, in a later task, which is outside it — flipping `playing` and
          leaving the effect to start playback risked no audio on iPhone at all. So cue() is
          called synchronously here, within the tap.

          It goes through cue() rather than a direct a.play()/a.pause() because cue() is the
          one place that decides what the element does — including the read check that a direct
          call used to bypass, where resuming during a 30-second read replayed whatever tape had
          been rolling before it. The effect above still calls cue() for every other reason the
          track changes, and cue() no longer reassigns an unchanged `src`, so that second call
          cannot abort the playback this one starts. */}
      <button onClick={() => {
        const next = !playing;
        if (el.current) cue(el.current, item, next, () => setPlaying(false));
        setPlaying(next);
      }}>
        {playing ? 'Pause' : 'Play my hour'}
      </button>
      <p>{item.title} — {item.src}{item.audio ? '' : ' (read)'}</p>
      <p>{i + 1} of {list.length}</p>
    </section>
  );
}
