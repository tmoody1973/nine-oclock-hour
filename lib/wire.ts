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
  return {
    id: `${item.id}:${mode}`,
    label: item.title,
    len: mode === 'read' ? READ : item.len || item.est || READ,
    how: item.how,
    kind: item.kind,
    mode,
    topic: item.topic,
    src: item.src,
    audio: mode === 'tape' ? item.audio : undefined,
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
