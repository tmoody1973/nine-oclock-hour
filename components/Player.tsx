'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayItem } from '@/lib/playlist';
import styles from './Player.module.css';
import { CLOCK_IDLE, clockElapsed, cue, readLeft, runClock, toggle, type ReadClock, clock, hourElapsed} from '@/lib/player';

// Same one-liner the other five components carry (HourBuilder, Desks, HotClock, Aircheck,
// lib/hour.ts). Left duplicated rather than centralised: hoisting it is a six-file change that
// has nothing to do with this one.
// `clock` and `hourElapsed` come from lib/player.ts so the arithmetic is testable without
// rendering — same reason cue/unlock/toggle live there.

// What the producer is told is happening, and it is the whole point of this panel. Three
// states, because three different things can be true, and the third is the one that read as a
// broken app: a block with nothing to play at all.
const TAG = { tape: 'Tape', voice: 'Read', silent: 'Silent' } as const;

export function Player({ list, station, onDone }: { list: PlayItem[]; station: string; onDone?: () => void }) {
  // One element for the session. iOS unlocks audio on the element the user tapped;
  // creating a new one per track loses that unlock and playback silently stops.
  const el = useRef<HTMLAudioElement>(null);
  const next = useRef<HTMLAudioElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Where we are inside the CURRENT block, and how long that block runs. Two sources feed
  // these and they must never cross: a block with tape is counted by the media element itself
  // (the timeupdate/durationchange handlers below), a read by our own wall clock, because a
  // read has no media at all. Every handler that writes `pos` or `dur` is guarded on
  // `item.audio` for that reason — the five milliseconds of silence that unlock() plays run
  // through this same element and would otherwise report themselves as the block's duration.
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const readRun = useRef<ReadClock>(CLOCK_IDLE);
  // Mirrors `i` for the callbacks below. The lock-screen handlers are installed once per item
  // and would otherwise close over whichever index was current when they were wired up.
  const at = useRef(0);
  const item = list[i];

  // THE ONE WAY THE HOUR MOVES. On-screen skip, the two lock-screen buttons, the end of a tape
  // and the end of a read all come through here, so the readout is reset in exactly one place
  // — and so the lock screen and the on-screen buttons cannot drift apart, which is what the
  // brief asks for. A move that changes nothing really does nothing: resetting on a clamped
  // Back at the first block would send a read's countdown back to 0:00 on screen while the
  // timeout actually carrying the hour forward went on counting from where it already was.
  const go = useCallback((move: (n: number) => number) => {
    const to = move(at.current);
    if (to === at.current) return;
    at.current = to;
    readRun.current = CLOCK_IDLE;
    setPos(0);
    setDur(0);
    setI(to);
  }, []);

  useEffect(() => {
    const a = el.current;
    if (!a || !item) return;
    // Warm the next file FIRST. This line used to sit below the branch, where a spoken read's
    // `return () => clearTimeout(t)` exited the effect before reaching it — so the track after
    // every read started cold. Reads are 30 seconds; an un-warmed mp3 on a phone is exactly
    // where a gap opens in the hour. Traced through the real control flow, not spotted by eye.
    if (next.current && list[i + 1]?.audio) next.current.src = list[i + 1].audio!;
    cue(a, item, playing, () => setPlaying(false));
    // A read has no audio of its own, so the hour is carried forward by a timer instead — and
    // the timer is armed for what the read still OWES, not for its full length. Armed for the
    // full length (which is what this did before), a legal ID paused at 0:55 and resumed aired
    // for another sixty seconds while the bar beside it counted down the five that were left:
    // the two disagreed, and the bar was the one telling the truth.
    if (!item.audio && playing) {
      readRun.current = runClock(readRun.current, true, Date.now());
      const t = setTimeout(() => go((n) => n + 1), readLeft(item, readRun.current, Date.now()) * 1000);
      // Settling on the way out is what makes a pause cost the hour nothing. This cleanup runs
      // on pause, on a skip, and on any re-run of the effect; runClock() folds the open run
      // into the settled total every time, so none of those paths loses or double-counts.
      return () => { clearTimeout(t); readRun.current = runClock(readRun.current, false, Date.now()); };
    }
  }, [i, playing, item, list, go]);

  // The number on screen for a read has to come from somewhere. There is no media element
  // emitting timeupdate — cue() deliberately gives a read no source — so our own clock is read
  // four times a second while it runs. Only while it runs: paused, the last value stands, which
  // is exactly what a frozen countdown should do.
  useEffect(() => {
    if (!item || item.audio || !playing) return;
    const t = setInterval(() => setPos(clockElapsed(readRun.current, Date.now())), 250);
    return () => clearInterval(t);
  }, [item, playing]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.src, album: `${station} · the nine o'clock hour` });
    navigator.mediaSession.setActionHandler('nexttrack', () => go((n) => Math.min(n + 1, list.length - 1)));
    navigator.mediaSession.setActionHandler('previoustrack', () => go((n) => Math.max(n - 1, 0)));
    // Clear them on unmount. Without this the lock screen keeps this hour's title and its
    // next/previous buttons after the player is gone, and those buttons call into a component
    // that no longer exists.
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
    };
  }, [item, list.length, station, go]);

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

  // A block with no audio of its own airs on a timer against its scheduled length. One with
  // tape is measured against what the file actually turns out to be — `dur` starts at 0 and the
  // scheduled length stands in until the metadata lands, so an untimed piece shows its estimate
  // first and its truth a moment later, rather than showing nothing.
  const silent = !item.audio;
  const kind = silent ? 'silent' : item.mode === 'read' ? 'voice' : 'tape';
  const total = silent ? item.seconds : Number.isFinite(dur) && dur > 0 ? dur : item.seconds;
  const into = Math.min(Math.max(pos, 0), total);
  const left = Math.max(0, total - into);
  const source = item.src ? ` — ${item.src}` : '';
  const say = silent
    ? 'Nothing to play — this block airs on the clock'
    : kind === 'voice' ? `Read in our own voice${source}` : `Rolling tape${source}`;

  // The whole hour, for the "am I nearly there" question the block-level numbers cannot answer.
  // Blocks already aired are counted at their scheduled length, which is what the rundown
  // promised; only the block now playing is counted at its real position.
  const hourTotal = list.reduce((n, x) => n + x.seconds, 0);
  const hourInto = hourElapsed(list, i, into);
  const upNext = list[i + 1];

  return (
    <section aria-label="Player" className={styles.dock}>
      <audio
        ref={el}
        onEnded={() => go((n) => n + 1)}
        onTimeUpdate={(e) => { if (item.audio) setPos(e.currentTarget.currentTime); }}
        onLoadedMetadata={(e) => { if (item.audio) setDur(e.currentTarget.duration); }}
        onDurationChange={(e) => { if (item.audio) setDur(e.currentTarget.duration); }}
        preload="none"
      />
      <audio ref={next} preload="auto" style={{ display: 'none' }} />

      <div className={styles.head}>
        <span className={`${styles.lamp} ${playing ? styles.lampOn : ''}`}>{playing ? 'Rolling' : 'Paused'}</span>
        <span>{i + 1} of {list.length}</span>
      </div>

      {/* Polite, and deliberately around the block's identity rather than around the clock: a
          live region on the numbers would announce a new time four times a second forever. */}
      <div aria-live="polite">
        <p className={styles.now}>
          <span className={`${styles.tag} ${silent ? styles.tagSilent : kind === 'voice' ? styles.tagVoice : styles.tagTape}`}>{TAG[kind]}</span>
          <span className={styles.title}>{item.title}</span>
        </p>
        <p className={styles.say}>{say}</p>
      </div>

      <div className={styles.barRow}>
        {/* The bar is the picture; the figures beside it are the same fact in text, which is
            what a screen reader gets through aria-valuetext and what anyone reading in
            greyscale gets. Neither one is the only channel. */}
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={`Progress through ${item.title}`}
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(into)}
          aria-valuetext={`${clock(into)} of ${clock(total)}, ${clock(left)} still to run`}
        >
          <span className={`${styles.fill} ${silent ? styles.fillSilent : ''}`} style={{ width: `${total > 0 ? (into / total) * 100 : 0}%` }} />
        </div>
        <span className={`figure ${styles.time}`}>{clock(into)} <span>/ {clock(total)} · {clock(left)} to go</span></span>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.skip} onClick={() => go((n) => Math.max(n - 1, 0))} disabled={i === 0} aria-label="Skip back to the previous block">
          &lsaquo; Back
        </button>
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
            changes — by then the element is unlocked and no fresh gesture is needed.

            The two skip buttons beside it are NOT this: they only move `i`, and the effect cues
            the new block on an element the first tap has already unlocked. */}
        <button type="button" className={styles.play} onClick={() => {
          const a = el.current;
          if (!a) return;
          setPlaying(toggle(a, item, playing, () => setPlaying(false)));
        }}>
          {playing ? 'Pause' : 'Play my hour'}
        </button>
        <button type="button" className={styles.skip} onClick={() => go((n) => Math.min(n + 1, list.length - 1))} disabled={i >= list.length - 1} aria-label="Skip forward to the next block">
          Next &rsaquo;
        </button>
      </div>

      <p className={styles.foot}>
        <span>{upNext ? <>Next: <b>{upNext.title}</b>{upNext.src ? ` — ${upNext.src}` : ''}</> : <>Next: <b>the end of the hour</b></>}</span>
        <span className="figure">{clock(hourInto)} into the hour &middot; {clock(Math.max(0, hourTotal - hourInto))} left</span>
      </p>
    </section>
  );
}
