import 'server-only';
import type { How, WireItem } from './types';
import { classify } from './topics';

const CDS = 'https://content.api.npr.org/v1/documents';
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ponytail: CDS documents are arbitrary, profile-dependent JSON — a real type here would
// mean modeling NPR's whole schema just to read a few fields off it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CdsDoc = Record<string, any>;

export async function cdsQuery(params: Record<string, string>): Promise<CdsDoc[]> {
  const token = process.env.NPR_CDS_TOKEN;
  if (!token) throw new Error('NPR_CDS_TOKEN is not set');
  const url = new URL(CDS);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // A feed that HANGS is worse than one that fails: a stalled request eats the whole
  // function budget and, in a cron, silently produces no day file at all. 8s is generous
  // against a wire that normally answers in ~200ms. Verified 2026-09-16 that
  // AbortSignal.timeout aborts a hung connection and surfaces as an ordinary TimeoutError,
  // so the isolation wrapper in lib/day.ts catches it like any other failure.
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`CDS ${res.status} for ${url.pathname}?${url.searchParams}`);
  return (await res.json()).resources ?? [];
}

// NPR files its mp3s at a constant ~128 kbps, which is 16000 bytes per second of audio.
// MEASURED, not assumed: the five assets in lib/fixtures/me.json that carry both a duration
// and an mp3 fileSize come out at 128.1, 128.9, 128.1, 128.1 and 128.0 kbps — 16003 to 16116
// bytes per second, a 0.7% spread. So an estimate from file size is wrong by well under a
// second a minute. Keep the awkward 16000 rather than rounding it into something tidier:
// tidier would be a guess, and this is a measurement.
const BYTES_PER_SECOND = 16000;

// CDS keeps audio in an assets map the document points at by fragment href.
const primaryAudio = (doc: CdsDoc) => {
  const href: string | undefined = doc.audio?.[0]?.href;
  const asset = href?.startsWith('#/assets/') ? doc.assets?.[href.slice(9)] : undefined;
  const mp3 = asset?.enclosures?.find((e: { type?: string; href?: string; fileSize?: number }) => e.type === 'audio/mpeg');
  const seconds: number = asset?.duration ?? 0;
  // Untimed tape: the feed hands over the file but never says how long it runs. Its byte
  // count is the only length signal in the document, so that is what the estimate is built
  // from — and only when there is genuinely no duration to use instead. No fileSize means no
  // basis for a number, and inventing one there would be worse than leaving it untimed.
  // `len` deliberately stays 0: the item is still untimed, and every consumer downstream
  // (rollable(), block()'s Block.est, score()'s drift walk, the "≈ untimed" wire label)
  // keys on exactly that difference — a real duration is a promise, an estimate is a gamble.
  const est = !seconds && mp3?.fileSize ? Math.round(mp3.fileSize / BYTES_PER_SECOND) : undefined;
  return { seconds, est, href: mp3?.href as string | undefined };
};

export function toWireItem(doc: CdsDoc, how: How, src: string): WireItem {
  const audio = primaryAudio(doc);
  // collections come back as { id } with no name — see Step 3b.
  const ids: string[] = (doc.collections ?? []).map((c: { id?: string; href?: string }) => c.id ?? String(c.href ?? '').split('/').pop()).filter(Boolean);
  const topic = classify(ids, `${doc.title ?? ''} ${strip(doc.teaser ?? '')}`, how);
  const day = String(doc.publishDateTime ?? '').slice(0, 10);
  return {
    id: doc.id,
    src, how,
    kind: 'seg',
    title: strip(doc.title ?? ''),
    teaser: strip(doc.teaser ?? '').slice(0, 320),
    url: doc.webPages?.[0]?.href ?? doc.nprWebsitePath ?? '',
    topic,
    when: day,
    len: audio.seconds,
    est: audio.est,
    audio: audio.href,
    old: day !== new Date().toISOString().slice(0, 10),
  };
}
