// The hot clock: pure geometry for a ring diagram of the hour, in the vocabulary of NPR's
// own printed Morning Edition clock (see task-11-brief.md for the transcribed table). No DOM,
// no fetch, no Math.random, no import of anything that pulls in `server-only` — this is
// consumed by a client component (HotClock.tsx) and unit tested on its own.
//
// HOUR here is 3600, a real hour (360 degrees) — NOT lib/hour.ts's HOUR (3540, the
// schedulable programming inside it). Every `at` value from layout() is seconds from the top
// of a real hour, so the ring must divide by a real hour or every wedge slides out of
// position (see the brief: a block at 49:00 would be drawn at 49:50 if this used 3540). A
// fully-packed hour therefore sweeps 354 of 360 degrees and leaves a 6-degree gap at the top
// — the one minute that is never programming. That gap is correct; do not close it.
import type { Block } from './types';
import type { LayoutRow } from './hour';

export const HOUR = 3600;
export const MIN_ARC_SECONDS = 20;

export type ArcKind = 'silence' | 'credit' | 'window' | 'bed' | 'promo' | 'newscast' | 'segment';

export type Arc = {
  id: string;
  label: string;
  startAt: number;
  seconds: number;
  a0: number;
  a1: number;
  kind: ArcKind;
  minWidthApplied: boolean;
};

// First match wins, per the brief's reading of the reference key. `silence` and `promo`
// aren't fields Block carries today (our hour has no billboard/promo furniture — see the
// plan's "parked for later" note), so this one local type adds them as optional rather than
// widening Block itself for a case nothing yet produces. `as Record<string, unknown>` was the
// wrong tool here: it switched off name checking for `credit`, `window` and `music` too, which
// are real Block fields — a typo in any of them would have compiled, silently classified
// everything as 'segment', and still passed every test that doesn't specifically exercise it.
type ClockBlock = Block & { silence?: boolean; promo?: boolean };
function classify(b: LayoutRow['b']): ArcKind {
  const f = b as ClockBlock;
  if (f.silence) return 'silence';
  if (f.credit) return 'credit';
  if (f.window) return 'window';
  if (f.music) return 'bed';
  if (f.promo) return 'promo';
  if (f.kind === 'newscast') return 'newscast';
  return 'segment';
}

export function arcs(rows: LayoutRow[]): Arc[] {
  return rows.map(({ b, at }) => {
    const seconds = b.len;
    // Floored so a tiny element is still visible, and capped so a block at or past the top of
    // the hour still draws a normal wedge instead of vanishing (endpoints coincide at exactly
    // HOUR) or wrapping backwards (past HOUR). HOUR - 1, not HOUR: capping at HOUR exactly
    // reproduces the same vanishing wedge this is fixing.
    const drawnSeconds = Math.min(Math.max(seconds, MIN_ARC_SECONDS), HOUR - 1);
    const a0 = (at / HOUR) * 360;
    const a1 = a0 + (drawnSeconds / HOUR) * 360;
    return {
      id: b.id,
      label: b.label,
      startAt: at,
      seconds,
      a0,
      a1,
      kind: classify(b),
      minWidthApplied: drawnSeconds > seconds,
    };
  });
}
