import type { Block } from './types';

export type PlayItem = { id: string; title: string; src: string; audio?: string; seconds: number };

// v1 streams only network and our own audio. Another station's tape links out until they say yes.
export const toPlaylist = (hour: Block[]): PlayItem[] =>
  hour.map((b) => ({
    id: b.id,
    title: b.label,
    src: b.src ?? '',
    seconds: b.realLen ?? b.len,
    // A spoken read is our own script in our own voice, so it streams regardless of `how` —
    // the rights restriction on tape (satellite/ours only) doesn't apply to audio we made.
    audio: (b.mode === 'tape' && (b.how === 'satellite' || b.how === 'ours')) || (b.mode === 'read' && b.spoken) ? b.audio : undefined,
  }));
