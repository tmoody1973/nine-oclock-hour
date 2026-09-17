// The gesture grant, asked rather than assumed.
//
// READ docs/roadmap.md, "Inherited by any rewrite", before changing this. The short version:
// the React player (lib/player.ts) spends the listener's first tap on five milliseconds of
// silent audio to earn the browser's permission to make sound. An implementer instrumented
// the shipped code and found that clip has NEVER PLAYED — cue() pauses it before a frame
// sounds, and the browser logs "The play() request was interrupted by a call to pause()."
//
// The mechanism works anyway, on a premise nobody had written down: that the browser grants
// permission when play() is CALLED inside a gesture, not when playback SUCCEEDS. The evidence
// is circumstantial (if it were false, iPhones would already be silent) and it is still the
// one link in the chain that is reasoning rather than observation. It has to stay an
// assumption there, because an HTMLMediaElement exposes NO way to ask whether the grant
// landed — which is exactly why "just wait for the unlock to take effect" is impossible.
//
// Web Audio does expose it. `state` is the answer to the question the element cannot be asked.
// That is the single biggest thing this rewrite gains, and it is why this file exists before
// anything is built on top of it.

// Only the two members unlock() touches, so a test can hand it a plain object. There is no
// browser in this test run — every finding about real browser behaviour came from watching a
// real one, never from a suite (196 tests passed through both a broken player and a fixed one).
export type Resumable = { readonly state: AudioContextState; resume: () => Promise<void> };

// 'running' is the only value that means sound is now possible. Everything else is the honest
// reason it is not, and it is meant to be shown or logged rather than swallowed: a listener
// tapping a button that quietly did nothing is the failure this whole file exists to prevent.
export type UnlockResult = AudioContextState | 'failed';

// Call this INSIDE the tap handler, and await nothing before it. A browser grants the gesture
// to work that starts synchronously within the handler; anything awaited first can land after
// the gesture has expired, where the resume is refused exactly like any other deferred play().
// For the same reason the caller should start real audio in the same handler — see the rule
// carried over from the React build: let the tap land on the first block that actually HAS
// audio, and do not build a silent priming step and assume it ran.
export async function unlock(ctx: Resumable): Promise<UnlockResult> {
  // Already granted. Calling resume() again is harmless but pointless, and skipping it keeps
  // the common case (every tap after the first) free of an await that could be mistaken for
  // the one that matters.
  if (ctx.state === 'running') return 'running';
  // resume() rejects on a closed context, and browsers have historically rejected it outside a
  // gesture rather than merely leaving the state suspended. Both are refusals, not crashes:
  // the caller needs an answer it can act on, not an exception thrown out of a click handler.
  try {
    await ctx.resume();
  } catch {
    return 'failed';
  }
  // The assertion the element could never make. A resume() that resolves is NOT proof — the
  // promise settling says the request was processed, not that it was granted. Read the state
  // back and report what it actually says.
  return ctx.state;
}
