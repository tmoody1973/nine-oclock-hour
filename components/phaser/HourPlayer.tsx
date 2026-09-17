'use client';

// The hour, played back. A podcast player, not a block sequencer — Tarik: "player should be
// able to listen to whole hour, scrub the player to move and listen to any point."
//
// THE SCRUB RUNS ALONG THE RUNDOWN CLOCK, not along the audio, and seekTo() in lib/player.ts
// is where that decision lives. Silence does not air (docs/decisions/004), so the audio is
// shorter than the hour; dragging halfway could mean 9:30 on the rundown or halfway through
// what actually plays. The clock stays the truth and the audio follows it, so one number on
// screen means one thing.

import { useCallback, useMemo, useRef, useState } from 'react';
import { clock, landOn, seekTo } from '@/lib/player';
import type { PlayItem } from '@/lib/playlist';

export function HourPlayer({ list }: { list: readonly PlayItem[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [into, setInto] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  // Where each block sits on the rundown clock: the running total of scheduled lengths. This is
  // the hour the scoring talks about and the hour on screen, whatever the audio actually does.
  const ats = useMemo(() => {
    const out: number[] = [];
    let at = 0;
    for (const item of list) { out.push(at); at += item.seconds; }
    return out;
  }, [list]);
  const total = useMemo(() => list.reduce((n, i) => n + i.seconds, 0), [list]);

  // The position shown and scrubbed. Clamped into the block's own slot: a recording that runs
  // out early must not push the readout past where the next block begins, or the hour counter
  // jumps and then appears to run backwards — the exact lie this player was fixed for once.
  const at = index === null ? 0 : ats[index] + Math.min(into, list[index]?.seconds ?? 0);

  // Start or resume AT a given block. Called straight from a click handler, with nothing
  // awaited first: the browser grants audio to work that begins inside the gesture, and this is
  // the same rule the preview follows (lib/audio.ts, docs/roadmap.md).
  const startAt = useCallback((i: number, offset: number) => {
    const el = audioRef.current;
    const item = list[i];
    if (!el || !item?.audio) return;
    if (el.src !== item.audio) el.src = item.audio;
    if (Math.abs(el.currentTime - offset) > 0.3) el.currentTime = offset;
    setIndex(i);
    setInto(offset);
    setRefused(null);
    void el.play().then(() => setPlaying(true)).catch((e: Error) => {
      // A refusal reaches the screen rather than the void. A transport that looks responsive
      // and plays nothing is the failure this whole path has been rebuilt to make visible.
      setPlaying(false);
      setRefused(e.message);
    });
  }, [list]);

  const onPlayPause = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); return; }
    // Nothing started yet: the tap lands on the first block that HAS audio, never on silence.
    if (index === null) {
      const first = landOn([...list], 0, -1);
      if (first < list.length) startAt(first, 0);
      return;
    }
    void el.play().then(() => setPlaying(true)).catch((e: Error) => { setPlaying(false); setRefused(e.message); });
  }, [playing, index, list, startAt]);

  // Every move through the hour goes through here. Keeping it to ONE path is deliberate: split
  // between the end-of-clip handler and the skip buttons and Back quietly dies, landing on a
  // silent block and being thrown forward again (docs/roadmap.md).
  const go = useCallback((to: number, from: number) => {
    const n = landOn([...list], to, from);
    if (n < 0 || n >= list.length) { audioRef.current?.pause(); setPlaying(false); setIndex(null); setInto(0); return; }
    startAt(n, 0);
  }, [list, startAt]);

  const onScrub = useCallback((t: number) => {
    const s = seekTo([...list], t);
    // Off the end of the rundown is the end of the hour, not the last block.
    if (!s) { audioRef.current?.pause(); setPlaying(false); setIndex(null); setInto(0); return; }
    startAt(s.index, s.into);
  }, [list, startAt]);

  const current = index === null ? null : list[index];

  return (
    <section aria-labelledby="player-title" style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      <h2 id="player-title" style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a8a' }}>
        Your hour
      </h2>

      <p style={{ margin: 0, fontSize: 14 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(at)}</span>
        {' / '}
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{clock(total)}</span>
        {current ? <> — {current.title}</> : <> — not playing</>}
      </p>

      {/* The scrub runs 0 to the END OF THE RUNDOWN, not the length of the audio. Drag to 19:00
          and you land on the weather, because 19:00 is the weather. */}
      <input
        type="range" min={0} max={Math.max(1, total)} step={1} value={Math.round(at)}
        aria-label="Scrub the hour"
        onChange={(e) => onScrub(Number(e.target.value))}
        style={{ width: '100%' }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => go((index ?? 0) - 1, index ?? 0)} disabled={index === null}
                style={{ padding: '6px 12px', fontSize: 13 }}>Back</button>
        <button type="button" onClick={onPlayPause} style={{ padding: '6px 14px', fontSize: 13 }}>
          {playing ? 'Pause' : 'Play the hour'}
        </button>
        <button type="button" onClick={() => go((index ?? -1) + 1, index ?? -1)} disabled={index === null}
                style={{ padding: '6px 12px', fontSize: 13 }}>Next</button>
      </div>

      {refused ? <p style={{ margin: 0, fontSize: 12, color: '#b3261e' }}>The browser refused to play that: {refused}</p> : null}

      <p style={{ margin: 0, fontSize: 12, color: '#555' }}>
        Blocks with nothing to play are skipped rather than aired as silence, so the audio is
        shorter than the hour on the clock.
      </p>

      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) => setInto(e.currentTarget.currentTime)}
        onEnded={() => go((index ?? -1) + 1, index ?? -1)}
      />
    </section>
  );
}
