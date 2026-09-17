// What pulling a story out of the hour actually does.
//
// docs/phaser-design.md: "The real cost is the reflow, not a penalty. Pull a story from the
// middle and everything after it slides up. layout() already walks the hour and reports
// crashes — so pulling a 4:40 piece from position three means the 5:12 newscast now runs into
// the weather window at 9:19, AND THE ENGINE ALREADY KNOWS THAT AND CAN SAY SO. Consequence,
// not punishment — and it teaches the clock, which is the point."
//
// So this is shown BEFORE you commit, and looking is free. Only actions spend the morning
// (lib/morning.ts); examining what a move would do is not an action, it is the judgement the
// game is asking you to exercise.

import { layout, type Crash } from './hour';
import type { Block } from './types';

export type Reflow = {
  // How much shorter the hour gets. Always positive: you are taking something out.
  readonly shorterBy: number;
  // Crashes this pull CAUSES — the ones that make it expensive in the way that matters.
  readonly gained: readonly Crash[];
  // Crashes this pull FIXES. Pulling the piece that was running into the weather window is
  // usually the repair, and the hour should say so rather than only ever warning.
  readonly cleared: readonly Crash[];
};

// Two crashes are "the same crash" when they hit the same window in the same way. Magnitude is
// deliberately not part of the key: a weather window still being run into, by a different
// amount, has not been fixed and must not report as cleared-and-gained.
const keyOf = (c: Crash): string => `${c.label}|${'over' in c ? 'over' : 'late'}`;

export function reflowOf(hour: readonly Block[], removeId: string, pledge = false): Reflow {
  const before = layout([...hour], pledge);
  const after = layout(hour.filter((b) => b.id !== removeId), pledge);
  const beforeKeys = new Set(before.crashes.map(keyOf));
  const afterKeys = new Set(after.crashes.map(keyOf));
  return {
    shorterBy: Math.max(0, before.end - after.end),
    gained: after.crashes.filter((c) => !beforeKeys.has(keyOf(c))),
    cleared: before.crashes.filter((c) => !afterKeys.has(keyOf(c))),
  };
}

// Whether this pull makes the hour worse in a way worth warning about before it is paid for.
export const costsYou = (r: Reflow): boolean => r.gained.length > 0;

const windowsIn = (cs: readonly Crash[]): string[] => [...new Set(cs.map((c) => c.label.toLowerCase()))];

// The one line shown beside the control, BEFORE the morning is spent on it. Forward-looking on
// purpose: crashLine() in lib/hour.ts describes a collision that has already happened in the
// hour as it stands, and reusing it here would tell a producer something untrue about a move
// they have not made.
//
// It says what a pull FIXES as readily as what it breaks. An hour that only ever warns teaches
// you to fear the control instead of using it, and taking the overrunning piece out is usually
// the repair.
export function reflowNote(r: Reflow): string | null {
  if (r.gained.length) {
    return `Pull it and everything after slides up into the ${windowsIn(r.gained).join(' and the ')}.`;
  }
  if (r.cleared.length) {
    return `Pulling it clears the ${windowsIn(r.cleared).join(' and the ')}.`;
  }
  return null;
}
