import 'server-only';
import { head, list, put, del } from '@vercel/blob';
import type { DayFile } from './types';

const key = (date: string) => `days/${date}.json`;

export async function putDay(day: DayFile): Promise<string> {
  const { url } = await put(key(day.date), JSON.stringify(day), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  // The day file is not an archive: a week is enough to compare yesterday with today.
  const old = await list({ prefix: 'days/' });
  const cutoff = Date.now() - 7 * 864e5;
  await Promise.all(old.blobs.filter((b) => b.uploadedAt.getTime() < cutoff).map((b) => del(b.url)));
  return url;
}

export async function getDay(date: string): Promise<DayFile | null> {
  try {
    const meta = await head(key(date));
    return await fetch(meta.url, { cache: 'no-store' }).then((r) => r.json());
  } catch { return null; }
}
