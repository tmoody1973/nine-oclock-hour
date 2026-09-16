'use client';
import { useEffect, useRef, useState } from 'react';
import type { PlayItem } from '@/lib/playlist';

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
    if (item.audio) { a.src = item.audio; if (playing) void a.play().catch(() => setPlaying(false)); }
    else if (playing) { const t = setTimeout(() => setI((n) => n + 1), item.seconds * 1000); return () => clearTimeout(t); }
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
      <button onClick={() => { setPlaying((p) => !p); const a = el.current; if (!a) return; if (playing) a.pause(); else void a.play().catch(() => setPlaying(false)); }}>
        {playing ? 'Pause' : 'Play my hour'}
      </button>
      <p>{item.title} — {item.src}{item.audio ? '' : ' (read)'}</p>
      <p>{i + 1} of {list.length}</p>
    </section>
  );
}
