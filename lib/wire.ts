// Turns a day file into what a producer at one station sees, and turns what they pick into
// a schedulable Block. Ported from `prototype/index.html`'s `buildWire()` and `block()` — the
// one piece of this build with no prior confirmation that it does what Task 7 assumed: that
// `block().label` carries the wire item's title verbatim, which is what lets the aircheck
// match `day.mostCarried.title` against a block already in the hour. Pure, so it is testable
// without a browser and importable from the client component that renders it.
import type { Block, DayFile, How, Topic, WireItem } from './types';
import { FIXED_ID, READ } from './hour';

// The rights rules made visible to the producer. Ported verbatim from the prototype.
export const CAN_ROLL: Record<How, boolean> = { satellite: true, ours: true, station: false, podcast: false };
export const WHY_NOT: Partial<Record<How, string>> = {
  station: "another station's tape — read it with credit",
  podcast: 'podcast audio, not cleared for air',
};
export const HOW_LABEL: Record<How, string> = { satellite: 'satellite', ours: 'ours', station: 'other station', podcast: 'podcast' };

// The legal ID that opens every hour. `FIXED_ID` (from lib/hour.ts) carries only
// `id`/`label`/`len`/`fixed` — the prototype could push that bare object straight into its
// untyped `hour` array, where a missing `how`/`kind`/`mode`/`topic` just reads as `undefined`
// and quietly fails every category check (`how === 'ours'`, `kind === 'newscast'`, etc.),
// which is exactly what a legal ID should do: count toward nothing. `Block` in this codebase
// requires all four fields, so this constant fills them with values chosen to be equally
// invisible: `how: 'podcast'` matches none of the three how-based tallies in `score()`
// (locals wants 'ours', network wants 'satellite', credited wants 'station'); `kind: 'seg'`
// keeps it out of the newscast count; `mode` and `topic` never matter because `fixed: true`
// already routes it around every check that would read them.
export const LEGAL_ID: Block = { ...FIXED_ID, how: 'podcast', kind: 'seg', mode: 'read', topic: 'news' };

// The block that opens the hour, for ONE station. LEGAL_ID above is the silent base shared by
// all six; this is what gives it a voice, because the words are a station's own and a single
// shared constant can never say anyone's call letters.
//
// `spoken: true` is not a loophole in the rights gate — it is the honest answer to it.
// toPlaylist streams a read's audio only when `spoken` marks it as OUR OWN voice rather than a
// publisher's tape, and this recording is exactly that: our own TTS call, in our own storage,
// of words the station gave us. Nothing about the gate is loosened to let it through.
//
// With no recording the block is byte-for-byte what it has always been — sixty seconds of
// silence — except that it now SAYS so. Five of the six stations have never confirmed their
// wording, and a silent block that gives no reason is precisely what read as a broken app: the
// producer needs to see that the silence is missing words, not a dead player.
//
// A PARENTHETICAL, not a dash, and lib/wire.test.ts pins it: the rail appends its own " — read"
// to any read block's label, so a dash here renders as "Legal ID — no wording on file for this
// station — read" — two dashes and a sentence trailing into a stray word. "Legal ID (no wording
// on file) — read" parses on first reading, and it fixes that without changing the shared row
// that weather and traffic also render through.
//
// The station a producer is actually at sees no trace of any of this: with a recording the label
// is plain "Legal ID and promo".
export function legalIdBlock(station: { legalId?: string }): Block {
  if (!station.legalId) return { ...LEGAL_ID, label: 'Legal ID (no wording on file)' };
  return { ...LEGAL_ID, audio: station.legalId, spoken: true };
}

// What came in for the producer at `home`, plus the first two things their neighbour filed —
// read-and-credit only, never roll-able, which is the whole point of the exercise.
export function buildWire(day: DayFile, home: string): WireItem[] {
  const station = day.stations[home];
  const neighbour = day.stations[station.neighbour];
  // Not currently reachable — lib/day.ts always writes all six stations — but the score()
  // call site in HourBuilder already treats this lookup as possibly missing (`neighbour?.name`),
  // so this one matches it rather than the two call sites silently disagreeing about it.
  const borrowed: WireItem[] = (neighbour?.local ?? []).slice(0, 2).map((item) => ({ ...item, id: `nb-${item.id}`, how: 'station' }));
  return [...day.network, ...station.local, ...borrowed];
}

export function rollable(item: WireItem): boolean {
  return CAN_ROLL[item.how] && (item.len > 0 || !!item.est);
}

// Tape-vs-read is decided here. `label` MUST come from `item.title` — the aircheck's
// "every other newsroom carried this" line compares against it, following the
// `title: b.label` convention lib/playlist.ts already uses.
export function block(item: WireItem, mode: 'tape' | 'read', now = Date.now()): Block {
  const usingEstimate = mode === 'tape' && !item.len && !!item.est;
  // Our own voiced take, in whichever field the item carries it. `spokenAudio` is where the
  // cron writes it now; the `item.spoken` fallback reads the old shape, where the voiced read
  // sat in `audio` behind that flag. Day files live seven days and the page serves the latest
  // stored one whenever this morning's build has not landed, so dropping the fallback would
  // send every one of yesterday's reads back to silence.
  const voiced = item.spokenAudio ?? (item.spoken ? item.audio : undefined);
  return {
    id: `${item.id}:${mode}`,
    label: item.title,
    len: mode === 'read' ? READ : item.len || item.est || READ,
    how: item.how,
    kind: item.kind,
    mode,
    topic: item.topic,
    src: item.src,
    // A read only carries audio when it's our own voiced take — gated on `voiced` above,
    // never on `mode === 'read'` alone. Keying on mode alone would let a tape item added as
    // a read stream the publisher's tape through the back door — exactly the rights
    // violation display-only items exist to prevent. Tape mode still reads `item.audio` and
    // nothing else: voicing a story must never cost the producer the roll.
    audio: mode === 'tape' ? item.audio : voiced,
    spoken: mode === 'read' && !!voiced,
    est: usingEstimate,
    // The prototype's fake newscasts carried a hardcoded `expired: true`. Real ones carry an
    // ISO `expires` timestamp instead (see lib/day.ts), so the expiry has to be computed —
    // there was nothing to port here, only a gap to fill.
    expired: !!item.expires && Date.parse(item.expires) < now,
    old: !!item.old,
    long: mode === 'tape' && item.len > 900,
  };
}

// A block already in the hour for this wire item, in whichever mode it was added.
export function blockIdsFor(itemId: string): [string, string] {
  return [`${itemId}:tape`, `${itemId}:read`];
}

export function used(hour: Block[], item: WireItem): boolean {
  const [tape, read] = blockIdsFor(item.id);
  return hour.some((b) => b.id === tape || b.id === read);
}

// The one line that decides where a story can sit in the hour — shown in its detail sheet.
export function placementNote(item: WireItem): string {
  if (item.how === 'station') return `${item.src}'s reporting. You may credit it and read it, but their tape stays on their air.`;
  if (item.how === 'podcast') return 'Podcast audio. Not cleared for broadcast: talk about it, link it, never roll it.';
  if (item.expires && Date.parse(item.expires) < Date.now()) return `Already expired. This cut was good until ${item.expires}. At nine it is history.`;
  if (!item.len && item.est) return `No duration in the feed. Roughly ${Math.round(item.est / 60)} minutes, but nobody timed it. Roll it and you find out live.`;
  if (!item.len) return 'Text only. There is no tape, so this is a thirty-second read or nothing.';
  if (item.len > 900) return `A full show at ${Math.round(item.len / 60)} minutes. It will eat the hour whole.`;
  if (item.old) return "Yesterday's tape. Fine as texture, risky as news: the story may have moved overnight.";
  return `Clean to air at ${Math.round(item.len / 60)} minutes. Network tape, yours to roll.`;
}

export type { How, Topic };
