// What a preview actually plays.
//
// This is the feature Tarik noticed was missing while using the React build — "how come i
// don't have a built in player for listening and streaming stories" — and there genuinely was
// none: the wire linked out to the publisher's website. In the Phaser version the preview IS
// that player, and giving it a price (15 minutes, lib/morning.ts) turns a missing feature into
// the central decision of the game.
//
// WHICH AUDIO, and the answer is not invented here. block() in lib/wire.ts already decides it:
// `spokenAudio` is our own voiced take, with a fallback to `audio` behind the legacy `spoken`
// flag for day files written before that field existed — and those live seven days, so
// dropping the fallback sends yesterday's reads back to silence. `audio` without that flag is
// the PUBLISHER'S tape.
//
// STREAMED, NEVER COPIED. Publisher tape plays from the newsroom's own servers. The only audio
// this project stores is audio it made itself. That is a commitment the app makes in writing,
// so `from` travels with the URL and the player says whose server it is coming off.

import type { WireItem } from './types';

export type PreviewSource = {
  readonly url: string;
  // Tape is the newsroom's own recording, streamed from them. A read is ours, voiced by the
  // 5 a.m. job. A producer deciding whether to roll something wants the tape; a text story has
  // only the read, and hearing it is still the honest way to judge it.
  readonly what: 'tape' | 'read';
  readonly from: string;
};

// Our voiced take, in whichever field this day file carries it. Same expression as block().
const voicedOf = (item: WireItem): string | undefined => item.spokenAudio ?? (item.spoken ? item.audio : undefined);

// The publisher's tape — and NOT `item.audio` unconditionally. On a legacy item, `audio` holds
// our read behind the `spoken` flag, and calling that "the newsroom's tape" would put our
// synthetic voice behind their name.
const tapeOf = (item: WireItem): string | undefined => (item.spoken ? undefined : item.audio);

// Tape first: a producer auditioning a story is deciding whether to roll it, and the tape is
// what would go to air. The read is the fallback for a story that arrived as text, where it is
// the only thing there is to hear.
export function previewSource(item: WireItem): PreviewSource | null {
  const tape = tapeOf(item);
  if (tape) return { url: tape, what: 'tape', from: item.src };
  const voiced = voicedOf(item);
  if (voiced) return { url: voiced, what: 'read', from: item.src };
  return null;
}

// Why there is nothing to hear, in words rather than a greyed-out control. Every disabled
// thing in the React build explained itself; colour is never the only signal.
export function nothingToHear(item: WireItem): string | null {
  if (previewSource(item)) return null;
  return `${item.src} filed this as text and the morning job has not voiced it, so there is nothing to hear yet.`;
}

// Whose server this is coming off, said plainly on the player. Auditioning a story must never
// look like we are hosting it.
export function sourceNote(src: PreviewSource): string {
  return src.what === 'tape'
    ? `Streaming from ${src.from}'s own server. Nothing is copied here.`
    : `Our own read of ${src.from}'s story, voiced at five.`;
}
