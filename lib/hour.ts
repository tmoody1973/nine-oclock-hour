// The rules engine: lays out a radio hour against its fixed landmarks and scores how it
// aired. Ported from `prototype/index.html` (the played, tuned version of this game).
// Pure on purpose — no DOM, no fetch, no Math.random — so it can be unit tested and reused
// by whatever renders it. Where the prototype wrote to `document` or read `Math.random()`
// or a module-level `let`, this version takes an argument or returns a value instead.
import type { Block, Topic } from './types';

// The hour is 3540 seconds of schedulable programming — 59 minutes, not 60. The 1:00 legal
// ID sits on top of it: the Clock score's target is HOUR + 60 (3600), the real top of the
// hour, not HOUR itself.
export const HOUR = 3540;
export const READ = 30;

export type TimeWindow = { id: string; at: number; len: number; label: string };

// Two windows nobody may move, and the credit that pays for the hour.
export const WINDOWS: TimeWindow[] = [
  { id: 'wx', at: 19 * 60, len: 45, label: 'Weather window' },
  { id: 'tx', at: 49 * 60, len: 45, label: 'Traffic window' },
];
export const UNDERWRITING_BY = 30 * 60;
export const BULLETIN = {
  id: 'bulletin',
  label: 'BULLETIN — the Fed announces its decision',
  len: 75,
  at: 34 * 60,
  topic: 'economy' as Topic,
};

// Pledge week: two pitch breaks land in the hour and never move, and the credit doubles.
export const PITCHES: TimeWindow[] = [
  { id: 'p1', at: 12 * 60, len: 120, label: 'Pitch break' },
  { id: 'p2', at: 42 * 60, len: 120, label: 'Pitch break' },
];
export const FIXED_ID = { id: 'legalid', label: 'Legal ID and promo', len: 60, fixed: true as const };

type FixedRow = TimeWindow & { fixed: true; window: true };
export type LayoutRow = { b: Block | FixedRow; at: number };
export type Crash = { label: string; late?: number; over?: number; by?: string };
export type LayoutResult = { rows: LayoutRow[]; end: number; crashes: Crash[] };

// Walk the hour and drop the fixed windows where the clock reaches them. A block that is
// still running when a window comes up has crashed into it, and the walk says by how much.
export function layout(blocks: Block[], pledge: boolean): LayoutResult {
  const out: LayoutRow[] = [];
  const crashes: Crash[] = [];
  const pending = [...WINDOWS, ...(pledge ? PITCHES : [])].sort((a, b) => a.at - b.at).map((w) => ({ ...w }));
  let at = 0;
  for (const b of blocks) {
    while (pending.length && at >= pending[0].at) {
      const w = pending.shift()!;
      out.push({ b: { ...w, fixed: true, window: true }, at });
      if (at > w.at + 1) crashes.push({ label: w.label, late: at - w.at });
      at += w.len;
    }
    if (pending.length && at + b.len > pending[0].at && at < pending[0].at) {
      crashes.push({ label: pending[0].label, over: at + b.len - pending[0].at, by: b.label });
    }
    out.push({ b, at });
    at += b.realLen || b.len;
  }
  while (pending.length) {
    const w = pending.shift()!;
    out.push({ b: { ...w, fixed: true, window: true }, at });
    if (at > w.at + 1) crashes.push({ label: w.label, late: at - w.at });
    at += w.len;
  }
  return { rows: out, end: at, crashes };
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// Exported so the topic picker can say, truthfully, which picks change anything — the
// weights map (lib/taste.ts) is only ever consulted on these five (see the retention curve
// below), so this is the one list a caller needs, not a second hardcoded copy of it.
export const HEAVY_TOPICS: Topic[] = ['politics', 'world', 'economy', 'health', 'news'];

export type FlashChoice = 'now' | 'late' | 'skip';
type ScoreLabel = 'Clock' | 'On air' | 'Freshness' | 'Mix' | 'Hold';
// Per-topic penalty for a heavy story in the retention walk, not a cap on the five headline
// scores. Task 7 builds this from the listener's picks: 0 for a topic they chose, 2 for one
// they didn't. Falls back to the prototype's flat 2 wherever a topic isn't listed.
export type ScoreWeights = Partial<Record<Topic, number>>;

export type ScoreOpts = {
  pledge: boolean;
  // How the producer handled the 9:34 bulletin — the prototype's own modal decision;
  // that UI moment stays with the caller, this engine just scores the choice made.
  flash: FlashChoice;
  // Untimed tape's real-world drift, in seconds. The prototype re-rolled
  // `Math.round((Math.random() * 2 - 1) * 40)` per untimed block; the caller rolls once
  // (same formula) and passes the result here so the engine stays deterministic.
  drift: number;
  weights?: ScoreWeights;
  // ponytail: hour.ts doesn't own the station directory (that's lib/day.ts, which pulls in
  // server-only) — pass these through only if you want the station-flavored notes verbatim;
  // omitted, the engine falls back to a generic phrasing that still scores identically.
  city?: string;
  neighbour?: string;
};

type Note = ['ok' | 'warn' | 'bad', string, string];
export type ScoreResult = { scores: Record<ScoreLabel, number>; notes: Note[]; curve: number[]; low: number };

export function score(hour: Block[], opts: ScoreOpts): ScoreResult {
  const weights = opts.weights ?? {};
  const notes: Note[] = [];
  let onair = 25, fresh = 15, mix = 15;

  if (opts.flash === 'skip') {
    onair -= 6; fresh -= 4;
    notes.push(['bad', 'You passed on the bulletin.', 'Every other station in the network carried it. A listener scanning the dial heard it somewhere else.']);
  } else if (opts.flash === 'late') {
    fresh -= 3;
    notes.push(['warn', 'You held the bulletin for the next break.', 'The clock survived; the news was second-hand by the time it aired.']);
  } else {
    notes.push(['ok', 'You took the bulletin live at 9:34.', 'Everything after it shifted, which is what a bulletin does.']);
  }

  let drift = 0;
  const timed = hour.map((b) => {
    if (!b.est) return b;
    const real = b.len + opts.drift;
    drift += real - b.len;
    return { ...b, realLen: real };
  });
  if (drift) {
    notes.push([Math.abs(drift) > 25 ? 'warn' : 'ok', `Untimed tape ran <span class="figure">${clock(Math.abs(drift))}</span> ${drift > 0 ? 'long' : 'short'}.`,
      'Nobody timed those pieces before air. That is what untimed means.']);
  }

  const casts = timed.filter((b) => b.kind === 'newscast');
  const staleCast = casts.find((b) => b.expired && b.mode === 'tape');
  if (staleCast) {
    fresh -= 10; onair -= 10;
    notes.push(['bad', "You aired the <strong>7 a.m. newscast</strong> at nine o'clock.", 'It was written two hours ago and its lead has already changed. Take the nine.']);
  } else if (!casts.length) {
    fresh -= 6;
    notes.push(['warn', 'No newscast at the top of the hour.', 'Nine in the morning is when people check in for news.']);
  } else {
    notes.push(['ok', 'The newscast at the top of the hour was the current one.', '']);
  }
  if (casts.length > 1) {
    fresh -= 4;
    notes.push(['warn', 'Two newscasts in one hour.', 'The second one repeats the first.']);
  }

  const oldTape = timed.filter((b) => b.old && b.mode === 'tape');
  if (oldTape.length) {
    fresh -= Math.min(6, oldTape.length * 3);
    notes.push(['warn', `${oldTape.length} segment${oldTape.length > 1 ? 's' : ''} from yesterday's programs ran as tape.`, "Fine as texture, risky as news: the story moved overnight."]);
  }
  const longBlocks = timed.filter((b) => b.long);
  if (longBlocks.length) {
    mix -= 4;
    notes.push(['warn', `A full show ran inside the hour (<span class="figure">${clock(longBlocks[0].len)}</span>).`, 'A whole episode inside a news hour leaves no room to come back to the audience.']);
  }
  // No floor on `onair` here, matching Mix: the window-crash loop, and the missed/late-credit
  // cases below, all deduct from `onair` after this point. Flooring here only clamped the
  // first two of its five deductions (bulletin-skip and stale-newscast) and did nothing for
  // the rest, which is how a badly crashed hour rendered On air as a negative number just like
  // Mix did. The single floor now lives at the `scores` assembly, same as Mix.
  fresh = Math.max(0, fresh);

  // The windows nobody may move.
  const plan = layout(timed, opts.pledge);
  for (const c of plan.crashes) {
    onair -= 5;
    notes.push('over' in c
      ? ['bad', `You ran <span class="figure">${clock(c.over ?? 0)}</span> into the ${c.label.toLowerCase()}.`, `"${c.by}" was still going when the window opened. Weather and traffic do not wait for a segment to finish.`]
      : ['bad', `The ${c.label.toLowerCase()} opened <span class="figure">${clock(c.late ?? 0)}</span> late.`, 'People set their morning by these. Late is the same as missing.']);
  }

  // The credit that pays for the hour.
  const credit = timed.find((b) => b.credit);
  const creditAt = credit ? plan.rows.find((r) => r.b.id === credit.id)?.at ?? 9999 : null;
  if (creditAt === null) {
    onair -= 8;
    notes.push(['bad', 'The underwriting credit never ran.', 'That is the money that paid for this hour, and the account manager will be asking about it.']);
  } else if (creditAt > UNDERWRITING_BY) {
    onair -= 6;
    notes.push(['bad', `The credit ran at <span class="figure">${clock(creditAt)}</span>, past its half-hour window.`, 'Outside the window it does not count, and the station eats the spot.']);
  } else {
    notes.push(['ok', `The underwriting credit cleared at <span class="figure">${clock(creditAt)}</span>.`, '']);
  }

  const off = plan.end - (HOUR + 60);
  let clockScore: number;
  if (off > 0) {
    clockScore = 0;
    notes.push(['bad', `The hour runs <span class="figure">${clock(off)}</span> long.`, 'At ten the network joins whether you are finished or not. This is the one you cannot talk your way out of.']);
  } else {
    clockScore = Math.max(0, Math.round(30 - Math.abs(off) / 4));
    notes.push(Math.abs(off) > 20
      ? ['warn', `<span class="figure">${clock(-off)}</span> of dead air before the top of the hour.`, 'Silence is the fastest way to lose a listener.']
      : ['ok', `The hour lands within <span class="figure">${clock(Math.abs(off))}</span>.`, '']);
  }

  const locals = timed.filter((b) => b.how === 'ours' && !b.music).length;
  const music = timed.filter((b) => b.music).length;
  const network = timed.filter((b) => b.how === 'satellite' && b.kind === 'seg').length;
  const credited = timed.filter((b) => b.how === 'station').length;
  if (locals < 2) {
    mix -= 6;
    notes.push(['warn', 'Fewer than two local items.', opts.city ? `An hour someone in ${opts.city} could have heard anywhere.` : '']);
  }
  if (!music) {
    mix -= 5;
    notes.push(['warn', 'No music at all.', 'The hour reads as a news block to someone who came for songs.']);
  }
  if (network < 3) {
    mix -= 4;
    notes.push(['warn', 'Thin on network news for nine in the morning.', '']);
  }
  // No floor here on purpose: 6 + 5 + 4 sums to exactly 15, so these three penalties alone
  // can never take `mix` below 0 — the floor used to sit right here and was a no-op. The
  // grim-run penalty below is the fourth one, and it fires after this point; flooring here
  // instead of after it is what let Mix render as -4/15 in a live aircheck. The single floor
  // now lives at the `scores` assembly, after every deduction. This check reads the raw,
  // pre-grim-run value on purpose: "in proportion" describes these three checks, and must
  // still be true (and still say so) even on an hour that also ran three heavy topics in a
  // row — that penalty is a separate concern (pacing/exit-ramp), not a mix-of-sources problem.
  if (mix === 15) notes.push(['ok', 'Local, network and music in proportion.', '']);
  if (credited) {
    notes.push(['ok', `${credited} item${credited > 1 ? 's' : ''} from ${opts.neighbour ?? 'a neighbouring station'}, credited and read.`, 'Their reporting, your voice, their name on it.']);
  }

  // The exit ramp: three grim stories in a row, and the audience is owed something before a break.
  let run = 0, worstRun = 0, ramped = true;
  for (const b of timed) {
    const heavy = HEAVY_TOPICS.includes(b.topic) && !b.music && !b.fixed;
    if (heavy) { run++; worstRun = Math.max(worstRun, run); }
    else { if (run >= 3) ramped = ramped && (b.music || (['music', 'culture', 'local'] as Topic[]).includes(b.topic)); run = 0; }
  }
  void ramped; // computed for parity with the prototype, which never reads it after this loop either
  if (worstRun >= 3) {
    mix -= 4;
    notes.push(['warn', `<span class="figure">${worstRun}</span> grim stories ran back to back.`,
      'After three hard ones people need an exit ramp — music, a local piece, something human — before the next break.']);
  } else {
    notes.push(['ok', 'Never more than two heavy stories in a row.', '']);
  }
  if (opts.pledge) {
    notes.push(['warn', 'Pledge week: two pitch breaks and a doubled credit ate four and a half minutes.',
      'Same news, less room, and a listener who is already being asked for money.']);
  }

  const curve: number[] = [];
  let hold = 100, newsRun = 0;
  for (const b of timed) {
    const mins = Math.max(1, Math.round((b.realLen || b.len) / 60));
    const heavy = HEAVY_TOPICS.includes(b.topic);
    if (b.music) { hold = Math.min(100, hold + 4); newsRun = 0; }
    else if (b.fixed) hold -= 1;
    else {
      newsRun = heavy ? newsRun + 1 : 0;
      hold -= heavy ? (weights[b.topic] ?? 2) + Math.max(0, newsRun - 2) * 3 : 1;
      if ((b.realLen || b.len) > 400) hold -= 3;
      if (b.how === 'ours') hold += 2;
    }
    hold = Math.max(20, Math.min(100, hold));
    for (let i = 0; i < mins; i++) curve.push(hold);
  }
  const low = Math.min(...curve, 100);
  const holdScore = Math.max(0, Math.round((low - 40) / 4));
  notes.push(low < 65
    ? ['warn', `Listening bottomed out at <span class="figure">${low}%</span>.`, 'Three heavy stories back to back is where people reach for the dial.']
    : ['ok', `Listening never fell below <span class="figure">${low}%</span>.`, '']);

  const scores: Record<ScoreLabel, number> = {
    Clock: clockScore,
    'On air': Math.max(0, onair),
    Freshness: fresh,
    Mix: Math.max(0, mix),
    Hold: holdScore,
  };

  return { scores, notes, curve, low };
}
