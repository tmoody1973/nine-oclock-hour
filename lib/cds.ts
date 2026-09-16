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
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`CDS ${res.status} for ${url.pathname}?${url.searchParams}`);
  return (await res.json()).resources ?? [];
}

// CDS keeps audio in an assets map the document points at by fragment href.
const primaryAudio = (doc: CdsDoc) => {
  const href: string | undefined = doc.audio?.[0]?.href;
  const asset = href?.startsWith('#/assets/') ? doc.assets?.[href.slice(9)] : undefined;
  const mp3 = asset?.enclosures?.find((e: { type?: string; href?: string }) => e.type === 'audio/mpeg');
  return { seconds: asset?.duration ?? 0, href: mp3?.href as string | undefined };
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
    audio: audio.href,
    old: day !== new Date().toISOString().slice(0, 10),
  };
}
