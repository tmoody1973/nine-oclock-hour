import { buildDay } from '@/lib/day';
import { putDay, sweepReads, audioUrls } from '@/lib/store';
import { voiceRead, voiceId } from '@/lib/reads';
import { LEGAL_IDS } from '@/lib/legalid';
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
  //
  // The first write is PESSIMISTIC: every item about to be attempted is pre-marked
  // `voice:${id}` in `degraded`, before any of them run. Without this, a run killed by the
  // timeout mid-loop leaves behind the file from this same putDay() call — but written
  // BEFORE voicing, carrying no degraded markers at all, indistinguishable from a healthy
  // day that simply had no reads to voice. Each item's own marker is cleared the moment it
  // actually succeeds, so a clean run still ends with an empty (or absent) degraded list.
  const items = [...day.network, ...Object.values(day.stations).flatMap((s) => s.local)];
  // EVERY story gets voiced, the ones that arrived with the publisher's own tape included.
  // This used to skip anything already carrying an audio href, on the reasoning that it had
  // audio already — but that audio is the publisher's TAPE, and reading a story instead of
  // rolling it is a normal editorial call (a 4:40 tape becomes a 30-second read when the hour
  // is tight). Those reads therefore had no voiced take of their own and played as thirty
  // seconds of silence. Two on a typical wire cannot be rolled at all, another newsroom's
  // tape not being ours to broadcast, so silence was the only outcome they had. The read now
  // lands in `spokenAudio`, beside the tape rather than on top of it, so voicing a story
  // costs the producer nothing and every story has a way to air.
  //
  // Still deduped by id: the three network queries in lib/day.ts are concatenated with no
  // dedupe, so the same CDS story can in principle appear twice with the same id. Two entries
  // sharing an id would pre-mark two IDENTICAL `voice:${id}` strings — and the clear below
  // uses `filter`, which removes every matching occurrence in one call, not one. If the twins
  // ever got different outcomes (one succeeds, one fails), the successful clear would wipe out
  // the failing twin's marker too, and that failure would go invisible — exactly the silence
  // the pessimistic write exists to prevent. Deduping also means the same story is never
  // voiced (and paid for) twice. The extra spend for the stories that used to be skipped is
  // about six reads a morning, and voiceRead's readKey cache makes a repeat run near-free.
  const seenIds = new Set<string>();
  const toVoice = items.filter((item) => {
    if (seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });
  if (toVoice.length) {
    day.degraded = [...(day.degraded ?? []), ...toVoice.map((item) => `voice:${item.id}`)];
  }
  // sweep: false — the final putDay() below runs the same day-file sweep again a few
  // seconds later; running it here too finds nothing that call won't also find.
  // Recorded BEFORE the pessimistic write, and before the reads pool below. It is one cached
  // call after the first morning, while the pool is the long, kill-prone part — so putting it
  // first costs nothing and means a run killed during voicing still leaves a stored day whose
  // hour opens on the station's own identification. Ordered last, a timeout left s921 showing
  // "Legal ID (no wording on file)", which is false: the words are on file, the recording is not.
  // The legal identification that opens every hour, per station — and the only VERBATIM
  // recording this job makes. voiceId() goes straight to text-to-speech; voiceRead() would send
  // the words to the script model to be rewritten first, which is right for a news read and a
  // regulatory violation here. Only stations whose wording somebody actually confirmed are in
  // LEGAL_IDS (lib/legalid.ts); the rest keep a silent opening block that says why, rather than
  // a call sign guessed on somebody else's licence.
  //
  // Sequential rather than pooled, unlike the reads above: at most six, and keyed on the words
  // instead of the date, so every morning after the first is a cache hit that costs nothing and
  // there is no concurrency worth managing. A failure leaves that station exactly where it was
  // yesterday — silent — and says so in `degraded`. Silence is a bad opening block; a wrong
  // identification is a licence problem, so there is no fallback here on purpose.
  for (const [id, st] of Object.entries(day.stations)) {
    const words = LEGAL_IDS[id];
    if (!words) continue;
    try {
      st.legalId = await voiceId(words, READ_VOICE);
    } catch (e) {
      console.error(`legal ID for ${id} failed, its hour opens silent — ${(e as Error).message}`);
      day.degraded = [...(day.degraded ?? []), `legalid:${id}`];
    }
  }

  await putDay(day, undefined, false);

  await pool(toVoice, READ_CONCURRENCY, async (item) => {
    try {
      // Into `spokenAudio`, NEVER `item.audio`. That field holds the publisher's tape, and
      // assigning over it is exactly what used to destroy the producer's ability to roll the
      // story — which is why this route refused to voice such stories in the first place.
      item.spokenAudio = await voiceRead(item, READ_VOICE);
      // Clear only this item's own marker — never anyone else's. Safe under concurrency:
      // the read of `day.degraded` and the write back happen on the same line, with no
      // `await` between them, so this whole statement runs to completion before the event
      // loop can hand control to any other worker. Two workers finishing "at the same time"
      // still clear one at a time, each against the array the other just left behind — see
      // lib/pool.test.ts for the same pattern proven under real staggered concurrency.
      day.degraded = (day.degraded ?? []).filter((d) => d !== `voice:${item.id}`);
    } catch (e) {
      console.error(`voice ${item.id} failed, leaving it as a card — ${(e as Error).message}`);
      // Its marker is already sitting in day.degraded from the pessimistic write above.
    }
  });

  // Reads older than three days and no longer referenced by any surviving day file — see
  // lib/store.ts's sweepReads for the trap this avoids (day files sweep at 7 days; deleting
  // reads blindly at 3 would leave a day aged 4-7 pointing at audio that no longer exists).
  // A sweep failure must not fail the build: it's storage hygiene, not this morning's
  // content, so it's recorded into degraded rather than thrown — a sweep that silently stops
  // working is exactly the kind of thing that would otherwise run unnoticed until the store
  // fills up. Runs BEFORE the final putDay, not after: appending to day.degraded once the
  // day file is already written only reaches the HTTP response, gone the moment the request
  // ends — invisible to any monitor that reads the stored file instead.
  //
  // `items` (not `toVoice`) is passed as `alsoReferenced` — not because "minutes old" makes
  // today's reads safe (it doesn't: a cache hit can set item.spokenAudio to a blob from a day file
  // that putDay's own 7-day sweep just evicted earlier in this very call, orphaning it in
  // storage before today's file is ever written), but because the sweep's referenced set is
  // built from STORED day files, and today's stored copy predates voicing — the pessimistic
  // write at the top of this handler put it there before any read was assigned, so it carries
  // none of this run's audio. Every read this run actually holds — freshly voiced or a cache
  // hit — is referenced by definition, regardless of what's on disk yet.
  //
  // `audioUrls` is what collects them, and it reads `spokenAudio` as well as `audio`. Handing
  // the sweep a list built from `audio` alone would name none of this morning's reads and
  // watch it delete every one of them minutes after we paid to make them. The publisher tape
  // URLs it also collects are harmless: they can never match a reads/ object.
  //
  // Known assumption, alongside the 1000-per-page one in lib/store.ts: this protection works
  // by URL string equality between what voiceRead()/head() returns and what list() reports
  // for the same object. Holds against the real store today (confirmed live) — if Blob ever
  // changed the form of one but not the other, alsoReferenced would silently stop protecting.
  try {
    const swept = await sweepReads(new Date(), undefined, audioUrls(items));
    if (swept.length) console.log(`swept ${swept.length} expired read(s): ${swept.join(', ')}`);
  } catch (e) {
    console.error(`read sweep failed — ${(e as Error).message}`);
    day.degraded = [...(day.degraded ?? []), 'sweep:reads'];
  }

  if (day.degraded?.length === 0) delete day.degraded; // absent on a healthy day — see lib/types.ts
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
