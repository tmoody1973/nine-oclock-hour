import type { Block } from './types';

// `mode` rides along so the player can SAY which of three things is happening — the
// publisher's tape is rolling, our own recorded voice is reading, or there is nothing to play
// and the block is airing on the clock. `audio` alone cannot separate the first two: a voiced
// read carries audio too (lib/wire.ts). The third is `audio` being absent, and it is the state
// that made the app look broken — a silent legal ID is indistinguishable from a dead player
// unless the screen says so.
export type PlayItem = { id: string; title: string; src: string; audio?: string; seconds: number; mode: Block['mode'] };

// v1 streams only network and our own audio. Another station's tape links out until they say yes.
export const toPlaylist = (hour: Block[]): PlayItem[] =>
  hour.map((b) => ({
    id: b.id,
    title: b.label,
    src: b.src ?? '',
    seconds: b.realLen ?? b.len,
    mode: b.mode,
    // A spoken read is our own script in our own voice, so it streams regardless of `how` —
    // the rights restriction on tape (satellite/ours only) doesn't apply to audio we made.
    audio: (b.mode === 'tape' && (b.how === 'satellite' || b.how === 'ours')) || (b.mode === 'read' && b.spoken) ? b.audio : undefined,
  }));
