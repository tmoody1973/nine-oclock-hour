// What the browser ACTUALLY did, written where a phone can show it.
//
// The method note in docs/roadmap.md matters more than any finding in it: 196 tests passed
// through both a broken player and a fixed one, and everything real came from instrumenting
// the audio element and watching an hour run. This is that harness for the Phaser build,
// deliberately built at the same time as the unlock rather than after it.
//
// On SCREEN rather than in the console, because the one platform nobody has ever tested this
// on is an iPhone, and a phone has no console to read. A log the tester cannot see is a log
// that does not exist.

export type Entry = { readonly t: number; readonly what: string; readonly detail?: string };

// `performance.now()` rather than Date.now(): these intervals are tens of milliseconds apart
// (the React run caught a rejection 55ms after the call that caused it) and a wall clock is
// too coarse to place them in order reliably.
export function audioLog(now: () => number = () => performance.now()) {
  let entries: readonly Entry[] = [];
  const start = now();
  return {
    record(what: string, detail?: string): void {
      // New array every time — never push into the one a caller may be holding. See the
      // immutability rule this codebase follows throughout.
      entries = [...entries, { t: Math.round(now() - start), what, detail }];
    },
    entries: (): readonly Entry[] => entries,
    lines: (): readonly string[] =>
      entries.map((e) => `${String(e.t).padStart(5)}ms  ${e.what}${e.detail ? `  — ${e.detail}` : ''}`),
  };
}

// THE CHECK THE WHOLE HARNESS EXISTS FOR.
//
// Phaser 4 does its own unlock: it listens on document.body and calls context.resume() inside
// the gesture. But read WebAudioSoundManager.js — it sets `unlocked = true` in resume()'s
// `.then()` and NEVER looks at context.state. The next update() tick then clears `locked` and
// fires UNLOCKED. So both of Phaser's signals mean "resume() resolved", which is precisely the
// unwritten premise the React build rested on (docs/roadmap.md). Phaser MOVES that assumption;
// it does not remove it.
//
// `unlock()` in lib/audio.ts removes it, by reading the state back. This function is what
// makes the two answers argue out loud instead of silently disagreeing.
export function disagreement(phaserUnlocked: boolean, state: AudioContextState): string | null {
  if (phaserUnlocked && state !== 'running') {
    return `Phaser reports UNLOCKED but the context is "${state}". Nothing will come out of the speakers. This is the case the element could never detect.`;
  }
  if (!phaserUnlocked && state === 'running') {
    return `The context is running, but Phaser still reports locked. It will queue sounds it is already allowed to play.`;
  }
  return null;
}
