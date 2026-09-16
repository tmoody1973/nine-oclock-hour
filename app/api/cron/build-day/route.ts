import { buildDay } from '@/lib/day';
import { putDay } from '@/lib/store';
import { voiceRead } from '@/lib/reads';
import { DEFAULT_VOICE } from '@/lib/voices';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The in-app audition picker (components/HourBuilder.tsx) previews voices in the browser;
// it has no way to reach the server, and there's no database to persist its choice into.
// This is the one thing that actually changes the morning build's voice — set by hand in
// Vercel, not by anything a listener or a producer clicks.
const READ_VOICE = process.env.READ_VOICE || DEFAULT_VOICE;

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
  // Voice every item with no tape so it can go on air read, in our own words. A read that
  // fails to voice becomes a card in the player, not a failed cron — see lib/reads.ts.
  for (const item of [...day.network, ...Object.values(day.stations).flatMap((s) => s.local)]) {
    if (!item.audio) { try { item.audio = await voiceRead(item, READ_VOICE); item.spoken = true; } catch { /* a missing read is a card, not a failure */ } }
  }
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
