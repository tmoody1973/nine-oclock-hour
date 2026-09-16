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
// plan's "parked for later" note), so they're read loosely rather than added to lib/types.ts
// for a case nothing yet produces; the order still holds for the day something does.
function classify(b: LayoutRow['b']): ArcKind {
  const flags = b as Record<string, unknown>;
  if (flags.silence) return 'silence';
  if (flags.credit) return 'credit';
  if (flags.window) return 'window';
  if (flags.music) return 'bed';
  if (flags.promo) return 'promo';
  if ((b as Block).kind === 'newscast') return 'newscast';
  return 'segment';
}

export function arcs(rows: LayoutRow[]): Arc[] {
  return rows.map(({ b, at }) => {
    const seconds = b.len;
    const drawnSeconds = Math.max(seconds, MIN_ARC_SECONDS);
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
