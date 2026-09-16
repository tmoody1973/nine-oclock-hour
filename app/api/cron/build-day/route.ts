import { buildDay } from '@/lib/day';
import { putDay } from '@/lib/store';
import { voiceRead } from '@/lib/reads';
import { DEFAULT_VOICE } from '@/lib/voices';
import { pool } from '@/lib/pool';

export const dynamic = 'force-dynamic';
// Measured live against real Gemini + Blob: one read (script + TTS) takes ~25s. A real wire
// runs ~26 items, so sequential at the old 60s limit voiced barely two before the function
// was killed — putDay-first meant the day survived, but the feature didn't. 300s is
// Vercel's current default function limit on all plans, and at READ_CONCURRENCY-way
// parallelism below, ~26 items lands near 2 minutes — comfortably inside it, with headroom.
export const maxDuration = 300;

// The in-app audition picker (components/HourBuilder.tsx) previews voices in the browser;
// it has no way to reach the server, and there's no database to persist its choice into.
// This is the one thing that actually changes the morning build's voice — set by hand in
// Vercel, not by anything a listener or a producer clicks.
const READ_VOICE = process.env.READ_VOICE || DEFAULT_VOICE;

// Six live Gemini calls in flight at once. Bounded, not unlimited: 26 items all at once
// would hit whatever rate limit Gemini enforces long before it saved any real time, and a
// 429 under concurrency is a `degraded` entry, not a crash — see lib/pool.ts's backstop.
const READ_CONCURRENCY = 6;

export async function GET(req: Request) {
  // Refuse when the secret is UNSET, before comparing anything. Without this the comparison
  // is against the literal string "Bearer undefined" — and this repo is public, so the route
  // path and that exact string are readable by anyone. A deploy that skips
  // `vercel env add CRON_SECRET` would leave the endpoint open to the world, and every
  // unauthorised hit runs nine CDS queries against our station credentials and writes to our
  // Blob store. 503 rather than 401 because the fault is ours, not the caller's, and it
  // reads differently in the logs.
  const expected = process.env.CRON_SECRET;
  if (!expected) return new Response('no', { status: 503 });
  if (req.headers.get('authorization') !== `Bearer ${expected}`) return new Response('no', { status: 401 });
  const day = await buildDay();
  // Write the day file BEFORE voicing, not after. Voicing used to run before the only
  // putDay() call — a timeout there lost the whole day, not just the reads, and the site
  // fell back to yesterday via getLatestDay(). Now a timeout costs reads, never the day —
  // still true even at 300s and 6-way concurrency, since nothing about raising the budget
  // changes what happens if it's still not enough some morning.
  await putDay(day);
  // Voice every item with no tape so it can go on air read, in our own words, up to
  // READ_CONCURRENCY at a time. A read that fails to voice becomes a card in the player, not
  // a failed cron — but the failure itself must be visible. Without `degraded`, a dead or
  // missing GEMINI_API_KEY (rejected by Gemini, swallowed here) looks exactly like a healthy
  // morning with fewer reads than usual. Items are mutated in place (`item.audio = ...`),
  // never collected and reassigned — day.network and each station's .local array keep their
  // original order regardless of which item finishes voicing first.
  const items = [...day.network, ...Object.values(day.stations).flatMap((s) => s.local)];
  await pool(items, READ_CONCURRENCY, async (item) => {
    if (item.audio) return;
    try {
      item.audio = await voiceRead(item, READ_VOICE);
      item.spoken = true;
    } catch (e) {
      console.error(`voice ${item.id} failed, leaving it as a card — ${(e as Error).message}`);
      day.degraded = [...(day.degraded ?? []), `voice:${item.id}`];
    }
  });
  const url = await putDay(day);
  // `degraded` names any feed that failed this morning. It is the only machine-readable
  // signal that the wire is thin because something broke rather than because nobody filed,
  // so it belongs in the response a human or a monitor actually looks at. Absent on a
  // healthy day — see lib/types.ts.
  return Response.json({
    date: day.date,
    network: day.network.length,
    stations: Object.fromEntries(Object.entries(day.stations).map(([id, st]) => [id, st.local.length])),
    degraded: day.degraded ?? [],
    url,
  });
}
