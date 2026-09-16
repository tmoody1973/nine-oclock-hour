import 'server-only';
import { cdsQuery, toWireItem } from './cds';
import type { DayFile, WireItem } from './types';

export const STATIONS = {
  s921: { name: '88Nine Radio Milwaukee', city: 'Milwaukee', neighbour: 's55' },
  s55:  { name: 'KCRW', city: 'Los Angeles', neighbour: 's552' },
  s308: { name: 'WBEZ', city: 'Chicago', neighbour: 's295' },
  s552: { name: 'WNYC', city: 'New York', neighbour: 's308' },
  s295: { name: 'WABE', city: 'Atlanta', neighbour: 's150' },
  s150: { name: 'KQED', city: 'the Bay Area', neighbour: 's921' },
} as const;

// **WBEZ files no web link on any story.** Verified against live CDS on 2026-09-16 by
// walking every string in a WBEZ document: there is no `webPages`, no `nprWebsitePath`,
// no canonical page anywhere — only CDS internal paths and the audio enclosure. WNYC omits
// it occasionally too. Dropping those items would empty Chicago out of a six-newsroom
// product, so instead we attribute at station level: the item links to the newsroom that
// filed it. That is weaker than a story link and it is a deliberate trade — see the
// decision record in Task 8. These six resolved on 2026-09-16 (KCRW answered 429 and WABE
// 403 to a bare curl, which is anti-bot behaviour, not a bad domain).
const SITE: Record<string, string> = {
  s921: 'https://radiomilwaukee.org',
  s55:  'https://www.kcrw.com',
  s308: 'https://www.wbez.org',
  s552: 'https://www.wnyc.org',
  s295: 'https://www.wabe.org',
  s150: 'https://www.kqed.org',
};

// Verified live that an NPR News Now newscast document carries no `webPages` and no
// `nprWebsitePath` at all — only an org-API href and image assets. Without a fallback,
// `airable` was dropping every single newscast, and the newscast is core furniture in the
// hour (it is the subject of the prototype's expiry trap), not incidental content. So
// network items get the same publisher-level fallback stations already have, keyed by
// `src` instead of station id. Targets verified 200 on 2026-09-16.
const NETWORK_SITE: Record<string, string> = {
  'NPR': 'https://www.npr.org/podcasts/500005/npr-news-now',
  'Morning Edition': 'https://www.npr.org/programs/morning-edition',
  'All Things Considered': 'https://www.npr.org/programs/all-things-considered',
};

// The short version of this list WAS the bug. Words like "have", "their", "over", "this"
// and "said" survive the length>3 filter and carry no subject, so two unrelated headlines
// sharing three of them looked like two newsrooms on one story. Measured on a real wire:
// with the short list, KQED's data-broker story paired with an All Things Considered story
// about Israeli emigration on "have"/"their"/"over".
const STOP = new Set([
  'the','a','an','of','in','on','to','for','and','at','is','are','as','its','after','with','from',
  'have','has','had','been','being','their','them','they','this','that','these','those',
  'than','then','over','under','out','into','about','more','most','some','many','much',
  'new','how','why','what','who','when','where','will','would','could','should',
  'says','said','say','make','made','take','takes','back','down','just','also','still',
  'before','during','while','year','years','week','weeks','day','days',
  'first','last','next','other','another','because','through','against','between','among',
]);
const keywords = (title: string) => title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w));

// Two newsrooms are on the same story when their headlines share three significant words —
// not two. Measured against 16 September's real wire (52 headlines): the two-word bar
// called WBEZ's "Washington Park mass shooting rattles community from Chicago's former
// Robert Taylor Homes" and WABE's "Federal case against man accused of plotting mass
// shooting at ..." the same story, on the strength of "mass" and "shooting" alone — a
// Chicago neighbourhood shooting and an Atlanta federal case, falsely paired. Raising the
// bar to three words produced no match that day, which is correct: most days, no two of
// these six newsrooms are genuinely on the same story. Weighting by rarity does not rescue
// the two-word version either — both offending words appeared in only 2 of the 52
// headlines, so they were already rare; word overlap alone cannot tell a shared subject
// from a shared phrase on a corpus this small. The upgrade path, when the feature earns it,
// is sentence embeddings, not a cleverer word rule. `stations: 0` means no answer, not a
// weak one, so a lone headline matching only itself must never become the answer — that is
// why promotion below requires at least two distinct newsrooms, not just a nonzero count.
export function mostCarried(items: WireItem[]): DayFile['mostCarried'] {
  let best = { title: '', url: '', stations: 0 };
  for (const item of items) {
    const words = new Set(keywords(item.title));
    const stations = new Set(
      items.filter((other) => keywords(other.title).filter((w) => words.has(w)).length >= 3).map((o) => o.src),
    );
    // An item always matches itself, so a lone story scores 1, never 0. Only a genuine
    // cross-newsroom match is ever recorded — which is what makes `stations: 0` mean
    // "no answer" rather than "a weak answer", without every caller having to remember it.
    if (stations.size >= 2 && stations.size > best.stations) {
      best = { title: item.title, url: item.url, stations: stations.size };
    }
  }
  return best;
}

// NPR's display-only terms are "attribute via url". An item we cannot link back to
// cannot lawfully go on screen, so it never enters the day file. Dropping one story is
// harmless; showing an unattributed one is a rights problem. Station items have already
// been given their newsroom's own site as a fallback by this point, so anything reaching
// here with no url is network copy that arrived genuinely unattributable. The warning matters because
// this runs in a cron with nobody watching: a feed that changes shape should be visible
// in the logs rather than silently thinning the wire.
function airable(items: WireItem[]): WireItem[] {
  return items.filter((i) => {
    if (i.url) return true;
    console.warn(`dropped ${i.id} from ${i.src}: no url to attribute it to`);
    return false;
  });
}

export async function buildDay(now = new Date()): Promise<DayFile> {
  const date = now.toISOString().slice(0, 10);
  const q = (params: Record<string, string>) => cdsQuery({ sort: 'publishDateTime:desc', ...params });

  const [me, atc, casts] = await Promise.all([
    q({ collectionIds: '3', limit: '8' }),
    q({ collectionIds: '2', limit: '8' }),
    q({ collectionIds: '500005', limit: '2' }),
  ]);

  const network: WireItem[] = airable([
    ...casts.map((d, i) => ({ ...toWireItem(d, 'satellite', 'NPR'), kind: 'newscast' as const,
      expires: d.recommendUntilDateTime ?? d.expirationDateTime, old: i > 0 })),
    ...me.map((d) => toWireItem(d, 'satellite', 'Morning Edition')),
    ...atc.map((d) => toWireItem(d, 'satellite', 'All Things Considered')),
  ].map((i) => (i.url ? i : { ...i, url: NETWORK_SITE[i.src] ?? '' })));

  const stations: DayFile['stations'] = {} as DayFile['stations'];
  for (const [id, s] of Object.entries(STATIONS)) {
    const docs = await q({ collectionIds: '319418027', ownerHrefs: `https://organization.api.npr.org/v4/services/${id}`, limit: '6' });
    stations[id] = { ...s, local: airable(docs.map((d) => {
      const item = toWireItem(d, 'ours', s.name);
      return item.url ? item : { ...item, url: SITE[id] };   // new object, never mutated
    })) };
  }

  const locals = Object.values(stations).flatMap((s) => s.local);
  return { date, builtAt: now.toISOString(), network, stations, mostCarried: mostCarried(locals.concat(network)) };
}
