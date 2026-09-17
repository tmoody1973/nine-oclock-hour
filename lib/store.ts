import 'server-only';
import { head, list, put, del } from '@vercel/blob';
import type { DayFile } from './types';

const key = (date: string) => `days/${date}.json`;

// Exported only so it can be tested without Blob credentials. This is the one piece of
// branching logic in the whole build that DELETES, it runs unattended at 5 a.m., and a
// mistake here is unrecoverable — so it gets a test even though the functions around it
// cannot have one. A NaN timestamp (malformed upload date) compares false and is therefore
// KEPT, never deleted: fail-safe, and easy to invert by accident, so it is pinned by a test.
export const isStale = (uploadedAt: Date, now = Date.now()) => uploadedAt.getTime() < now - 7 * 864e5;

// Narrower than @vercel/blob's own types — only what putDay reads or calls. Same seam
// pattern as voiceRead's `blob` parameter and sweepReads' `StoreBlobDeps`: real callers
// never pass this and get the real @vercel/blob functions via the default. Kept separate
// from StoreBlobDeps rather than widened into it — put/list/del here have different option
// shapes than sweepReads' list/del, and two small honest types beat one loose one.
type PutDayBlobDeps = {
  put: (pathname: string, body: string, opts: { access: 'public'; contentType: string; addRandomSuffix: boolean; allowOverwrite: boolean }) => Promise<{ url: string }>;
  list: (options: { prefix: string }) => Promise<{ blobs: { url: string; uploadedAt: Date }[] }>;
  del: (urls: string[]) => Promise<void>;
  // How putDay finds out what is already stored for this date, for the empty-overwrite guard
  // below. Same seam as the rest of this type: real callers never pass it and get getDay.
  existingDay: (date: string) => Promise<DayFile | null>;
};
const defaultPutDayBlobDeps: PutDayBlobDeps = { put, list, del, existingDay: getDay };

// Every story in a day file, network and local. `buildDay()` never throws — each source is
// wrapped in a `safe()` that records the failure and returns [] — so a morning when the NPR
// token has expired still produces a perfectly well-formed file with this count at zero.
const itemCount = (day: DayFile) => day.network.length + Object.values(day.stations).reduce((n, s) => n + s.local.length, 0);

// The cron calls putDay twice per run — once pessimistically before voicing, once after —
// both times for the SAME date. Without `allowOverwrite: true`, @vercel/blob refuses the
// second write outright ("blob already exists"), so the final write throws every single
// morning: the day gets built, ~26 reads get voiced and paid for, and the run ends in a 500
// with nothing but orphaned reads/ objects to show for it. `sweep` defaults true and is only
// set false by the cron's own first call — the day-file sweep below can't find anything on
// that call that the second one won't also find, so running it twice is pure waste, not a
// correctness question.
export async function putDay(day: DayFile, blob: PutDayBlobDeps = defaultPutDayBlobDeps, sweep = true): Promise<string> {
  // Refuse to trade a morning's stories for nothing. The guard is on the CONTENT, never on
  // the mechanism: `allowOverwrite` below stays unconditionally true because the cron really
  // does write this key twice per run by design, and refusing overwrites as such would break
  // the build every morning. What must never happen is an empty file landing on top of a full
  // one — a re-run after an expired token produces exactly that, and the loss is total and
  // unrecoverable, with the page not even falling back (getDay(today) still succeeds, so
  // getLatestDay() is never reached; the producer just gets an empty wire with a banner).
  //
  // It lives here, not in the cron, because the cron's FIRST putDay is the one that does the
  // damage — by the time the second runs, the healthy file is already gone. One check on the
  // path every caller goes through covers both writes and anything added later.
  //
  // Empty-over-empty is deliberately allowed: an empty stored file is not a healthy one, and
  // a bad morning has to stay repairable by re-running.
  //
  // What a caller sees when it fires: this throws. In the cron that surfaces as a 500 with
  // the reason in the logs, nothing voiced (no Gemini spend on a build with no stories in
  // it), and the stored day file left exactly as it was.
  if (itemCount(day) === 0) {
    const stored = await blob.existingDay(day.date);
    if (stored && itemCount(stored) > 0) {
      throw new Error(`refusing to overwrite days/${day.date}.json with an empty build: the stored file has ${itemCount(stored)} items and this one has none`);
    }
  }
  const { url } = await blob.put(key(day.date), JSON.stringify(day), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true });
  if (sweep) {
    // The day file is not an archive: a week is enough to compare yesterday with today.
    // `list` returns at most 1000 per page and we ignore its cursor — safe here because one
    // write a day against a 7-day window keeps this prefix at ~8 blobs, three orders of
    // magnitude under the page size. If retention ever lengthens or this prefix is shared,
    // paginate, or older files will strand past page one and never be reached.
    const old = await blob.list({ prefix: 'days/' });
    const stale = old.blobs.filter((b) => isStale(b.uploadedAt)).map((b) => b.url);
    if (stale.length) await blob.del(stale);
  }
  return url;
}

export async function getDay(date: string): Promise<DayFile | null> {
  try {
    const meta = await head(key(date));
    return await fetch(meta.url, { cache: 'no-store' }).then((r) => r.json());
  } catch { return null; }
}

// The page's fallback for when the 5 a.m. cron hasn't run yet (or failed) and today has no
// file: serve whatever the most recent day was, rather than a blank page. Untested like
// `getDay`/`putDay` above it — it needs live Blob credentials to exercise, which is exactly
// why `isStale` was carved out as the one piece of branching logic that can run without them.
export async function getLatestDay(): Promise<DayFile | null> {
  try {
    const { blobs } = await list({ prefix: 'days/' });
    if (!blobs.length) return null;
    const latest = blobs.reduce((a, b) => (a.uploadedAt > b.uploadedAt ? a : b));
    return await fetch(latest.url, { cache: 'no-store' }).then((r) => r.json());
  } catch { return null; }
}

// Same fail-safe shape as isStale above, for the same reason: a malformed upload timestamp
// compares false and is KEPT, never deleted. A separate constant and function, not a
// parameterized isStale, because days/ and reads/ have genuinely different windows (7 days,
// 3 days) — collapsing them into one shared knob risks changing one when someone means the
// other. See sweepReads for why 3 days doesn't mean "delete anything 3 days old".
const READ_RETENTION_DAYS = 3;
export const isOldRead = (uploadedAt: Date, now = Date.now()) => uploadedAt.getTime() < now - READ_RETENTION_DAYS * 864e5;

// Narrower than @vercel/blob's own types — only the fields sweepReads actually reads or
// calls — so a test double doesn't have to fake a whole ListBlobResultBlob. Same seam
// pattern as voiceRead's `blob` parameter in lib/reads.ts: real callers never pass this and
// get the real @vercel/blob functions via the default.
type SweepBlob = { url: string; pathname: string; uploadedAt: Date };
export type StoreBlobDeps = {
  list: (options: { prefix: string }) => Promise<{ blobs: SweepBlob[]; hasMore: boolean }>;
  del: (urls: string[]) => Promise<void>;
};
const defaultStoreBlobDeps: StoreBlobDeps = { list, del };

// Deletes a voiced read only when it is BOTH older than the retention window AND not
// referenced by any surviving day file. Day files sweep at 7 days (isStale, above); reads
// sweep at 3 — and that gap is the whole trap this function exists to avoid. Deleting purely
// by age would leave day files aged 4-7 pointing at audio that no longer exists: Player loads
// that URL directly, with no error anywhere when it 404s. So every surviving day file's
// item.audio values are collected first, and anything still referenced survives regardless
// of age. Returns what it deleted rather than logging and swallowing — the caller (the cron)
// is what makes a sweep failure visible, by recording it into day.degraded.
//
// `alsoReferenced` exists because "referenced by a STORED day file" and "referenced right
// now" can disagree within a single cron run. The reason is NOT eviction ordering: the cron's
// first putDay passes `sweep: false`, and its only day-file eviction runs after sweepReads,
// so no day file is ever evicted before the referenced set is built from it. The reason is
// that today's stored day file PREDATES VOICING — the cron writes it pessimistically before
// any item.audio has been assigned — so it names none of this morning's reads, whether
// freshly voiced or served from the read cache. Built purely from storage, the referenced set
// would miss every one of them. Passing the run's own in-memory item.audio values here says
// "referenced by definition", and keeps that true wherever in the cron the sweep sits, rather
// than resting on a statement order that a future edit could quietly change.
export async function sweepReads(now = new Date(), blob: StoreBlobDeps = defaultStoreBlobDeps, alsoReferenced: Iterable<string> = []): Promise<string[]> {
  const { blobs: days, hasMore: moreDays } = await blob.list({ prefix: 'days/' });
  // The dangerous direction: a truncated days/ page means a truncated referenced set, which
  // means REAL, STILL-PLAYING audio looks unreferenced and gets deleted. reads/ truncating
  // only means a stale object survives a cycle longer — asymmetric risk, so only this
  // direction fails loudly rather than silently sweeping on partial information.
  if (moreDays) throw new Error('days/ exceeds one page; sweep aborted rather than risk deleting referenced audio');

  const referenced = new Set<string>(alsoReferenced);
  for (const day of days) {
    // No catch here — a day file that fails to fetch must NOT be treated as "references
    // nothing". A day 4-7 days old holds reads already past their own 3-day window; drop it
    // from the referenced set and the very next filter deletes audio a live file still
    // plays. One unreadable day file costs a failed sweep (caught by the cron, recorded into
    // degraded, visible) — that is a fully recoverable cost. Deleted audio is not.
    const res = await fetch(day.url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`day file ${day.pathname} unreadable: ${res.status}`);
    const file: DayFile = await res.json();
    for (const item of [...file.network, ...Object.values(file.stations).flatMap((s) => s.local)]) {
      if (item.audio) referenced.add(item.audio);
    }
  }

  // This assumption holds only while the sweep keeps running: ~26 reads/day × a 3-day window
  // is ~78 objects, nowhere near list()'s 1000-per-page cap. If the sweep itself degrades for
  // a month, reads/ accumulates at ~26/day and eventually exceeds one page — a silent
  // failure mode of its own, but the safe direction: a stale object surviving longer, never
  // a live one vanishing. Not guarded as strictly as days/ for that reason.
  const { blobs: reads } = await blob.list({ prefix: 'reads/' });
  const toDelete = reads.filter((r) => isOldRead(r.uploadedAt, now.getTime()) && !referenced.has(r.url));
  if (toDelete.length) await blob.del(toDelete.map((r) => r.url));
  return toDelete.map((r) => r.pathname);
}
