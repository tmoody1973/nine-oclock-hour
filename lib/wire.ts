// Turns a day file into what a producer at one station sees, and turns what they pick into
// a schedulable Block. Ported from `prototype/index.html`'s `buildWire()` and `block()` — the
// one piece of this build with no prior confirmation that it does what Task 7 assumed: that
// `block().label` carries the wire item's title verbatim, which is what lets the aircheck
// match `day.mostCarried.title` against a block already in the hour. Pure, so it is testable
// without a browser and importable from the client component that renders it.
import type { Block, DayFile, How, Topic, WireItem } from './types';
import { FIXED_ID, READ, type LayoutRow, type TimeWindow } from './hour';

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

// ── How a window learns to carry audio ────────────────────────────────────────────────────
// The two windows are NOT Blocks. lib/hour.ts defines them as `TimeWindow`s and the layout
// walk drops them in as `FixedRow = TimeWindow & { fixed; window }` — no `mode`, no `how`,
// nowhere to put a URL. And they never reached the player at all: <Player> was handed
// `toPlaylist(airedHour)`, the producer's own block array, so the rail, the hot clock and
// score() all knew about 90 seconds of windows that the thing actually playing did not. The
// played hour was a minute and a half shorter than the hour the rundown promised.
//
// So this is the join, and it lives at the PLAYER'S call site rather than in the hour itself.
// That placement is load-bearing: score() runs layout() again on the hour it is given, so an
// `airedHour` that already carried window blocks would have a second set inserted on top and
// every clock check would score a doubled hour. Convert on the way out, never on the way in.
//
// Windows become real Blocks shaped exactly like LEGAL_ID above and for the same reasons:
// `fixed: true` routes them around every check that would read `mode` or `topic`, and
// `how: 'podcast'` matches none of score()'s three how-based tallies, so a window counts
// toward nothing even if one ever does reach the engine.
export function windowBlock(w: TimeWindow, audio?: string): Block {
  return {
    id: w.id, label: w.label, len: w.len,
    how: 'podcast', kind: 'seg', mode: 'read', topic: 'local',
    fixed: true, window: true,
    // `spoken` is true ONLY where a real recording exists, which is what makes this honest
    // rather than a hole in the rights gate. toPlaylist streams a read's audio when `spoken`
    // marks it as OUR OWN voice instead of a publisher's tape, and a weather read is exactly
    // that: our recording, in our storage, of a National Weather Service forecast — a work of
    // the US government, public domain. Nothing in lib/playlist.ts or lib/wire.ts is loosened
    // to let it through. With no recording the window is what it has always been: silent, in
    // its place, holding the clock. No stale forecast and no fallback text — see the cron.
    audio,
    spoken: !!audio,
  };
}

// The hour as it actually airs: the producer's blocks with the fixed windows dropped in where
// the clock reached them. Producer blocks pass through by identity, never copied, so nothing
// here can quietly rewrite a story's audio, length or mode on the way to the player.
//
// `'mode' in b` is the discriminator, the same test the rail already uses — every Block has a
// mode and no FixedRow does.
//
// TWO SILENCES THAT LOOK IDENTICAL AND ARE NOT THE SAME FACT. The player says "Nothing to play
// — this block airs on the clock" for any block with no audio, which is exactly right for the
// traffic window: nobody ever intended a recording there, the host fills those 45 seconds live,
// and the silence is the design. An empty WEATHER window is the opposite — it means this
// morning's forecast or recording failed — and leaving it to read as "by design" is the same
// quiet dishonesty that made a silent legal ID look like a dead player. So the weather window
// carries the reason in its label when it has nothing to play, exactly as legalIdBlock does. A
// word, not a mechanism: no new field, no new state, and the traffic window is left alone
// because it has nothing to apologise for.
//
// The RAIL still shows the plain "Weather window" for both, because it renders layout()'s rows
// directly and layout() knows nothing about a station. Converting the rail's rows too would
// make it append its own " — read" suffix to every window, including traffic, which is not a
// read — that is the mechanism this deliberately stops short of.
export function airBlocks(rows: LayoutRow[], station: { weather?: string }): Block[] {
  return rows.map(({ b }) => {
    if ('mode' in b) return b;
    if (b.id !== 'wx') return windowBlock(b);
    if (station.weather) return windowBlock(b, station.weather);
    return windowBlock({ ...b, label: `${b.label} (no forecast this morning)` });
  });
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

// "good until 2026-09-17T08:20:00-04:00" is what a newscast's expiry looked like on screen.
// Nobody reads an ISO string at five in the morning.
//
// Formatted from the STRING, never through `new Date().toLocaleString()`: that would render in
// whatever timezone the reader's machine is in, disagree between server and client, and trip a
// hydration mismatch. The clock time in the string is already the newsroom's own.
//
// The zone name is derived only from the offsets CDS actually uses. NPR files Eastern, so
// -04:00 and -05:00 are EDT and EST; anything else keeps the raw offset rather than guessing a
// zone from a number, which is how "Atlantic" becomes "Eastern" silently.
export function expiryLabel(iso: string): string {
  const m = /T(\d{2}):(\d{2})(?::\d{2})?(Z|[+-]\d{2}:\d{2})?/.exec(iso);
  if (!m) return iso;
  const h24 = Number(m[1]);
  const hour = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = `${hour}:${m[2]} ${h24 < 12 ? 'a.m.' : 'p.m.'}`;
  const off = m[3];
  if (off === '-04:00' || off === '-05:00') return `${time} Eastern`;
  if (off === 'Z' || off === '+00:00') return `${time} UTC`;
  return off ? `${time} (UTC${off.replace(':00', '').replace(/^([+-])0/, '$1')})` : time;
}

// The one line that decides where a story can sit in the hour — shown in its detail sheet.
export function placementNote(item: WireItem): string {
  if (item.how === 'station') return `${item.src}'s reporting. You may credit it and read it, but their tape stays on their air.`;
  if (item.how === 'podcast') return 'Podcast audio. Not cleared for broadcast: talk about it, link it, never roll it.';
  if (item.expires && Date.parse(item.expires) < Date.now()) return `Already expired. This cut was good until ${expiryLabel(item.expires)}. At nine it is history.`;
  if (!item.len && item.est) return `No duration in the feed. Roughly ${Math.round(item.est / 60)} minutes, but nobody timed it. Roll it and you find out live.`;
  if (!item.len) return 'Text only. There is no tape, so this is a thirty-second read or nothing.';
  if (item.len > 900) return `A full show at ${Math.round(item.len / 60)} minutes. It will eat the hour whole.`;
  if (item.old) return "Yesterday's tape. Fine as texture, risky as news: the story may have moved overnight.";
  return `Clean to air at ${Math.round(item.len / 60)} minutes. Network tape, yours to roll.`;
}

export type { How, Topic };
