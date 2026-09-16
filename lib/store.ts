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

export async function putDay(day: DayFile): Promise<string> {
  const { url } = await put(key(day.date), JSON.stringify(day), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  // The day file is not an archive: a week is enough to compare yesterday with today.
  // `list` returns at most 1000 per page and we ignore its cursor — safe here because one
  // write a day against a 7-day window keeps this prefix at ~8 blobs, three orders of
  // magnitude under the page size. If retention ever lengthens or this prefix is shared,
  // paginate, or older files will strand past page one and never be reached.
  const old = await list({ prefix: 'days/' });
  await Promise.all(old.blobs.filter((b) => isStale(b.uploadedAt)).map((b) => del(b.url)));
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
