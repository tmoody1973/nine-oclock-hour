'use client';

// The persistent player. It stays on screen while you keep working the wire, because auditioning
// a story is something you do WHILE building an hour, not instead of it.
//
// Tarik, on the first attempt — a bare Hear it / Stop toggle over a hidden <audio> element:
// "MAKING the player go to another page to listen to the story is stupid and terrible
// experience what happen to the audio player or persistent audio player you were supposed to
// build!!!" Correct. A control that starts invisible audio is not a player: nothing said what
// was playing, how long it ran, or where you were in it, and the link OUT to the publisher sat
// beside it looking equally important.

import type { WireItem } from '@/lib/types';
import { clock } from '@/lib/player';
import { sourceNote, previewSource } from '@/lib/preview';
import styles from './HourBuilder.module.css';

export function NowPlaying({ item, playing, at, duration, onToggle, onSeek, onClose }: {
  item: WireItem;
  playing: boolean;
  at: number;
  duration: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onClose: () => void;
}) {
  const src = previewSource(item);
  return (
    <div className={styles.nowPlaying} role="region" aria-label="Audition player">
      <button type="button" onClick={onToggle} className={styles.npPlay} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚' : '▶'}
      </button>

      <div className={styles.npWhat}>
        <strong>{item.title}</strong>
        {/* Whose server the sound comes off, said on the player itself. Auditioning must never
            look like we host it. */}
        <span>{src ? sourceNote(src) : ''}</span>
      </div>

      <span className={styles.npTime}>{clock(at)}</span>
      <input
        className={styles.npScrub}
        type="range" min={0} max={Math.max(1, Math.round(duration))} step={1} value={Math.round(at)}
        aria-label={`Scrub ${item.title}`}
        onChange={(e) => onSeek(Number(e.target.value))}
      />
      <span className={styles.npTime}>{duration ? clock(duration) : '—:—'}</span>

      <button type="button" onClick={onClose} className={styles.npClose} aria-label="Close the player">×</button>
    </div>
  );
}
