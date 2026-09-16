import type { Block, Topic, WireItem } from './types';

// A front page has a shape a reader learns. This order is deliberate: not alphabetical,
// not by how many stories happen to have landed.
export const DESK_ORDER: Topic[] = ['news', 'politics', 'world', 'economy', 'health', 'tech', 'climate', 'culture', 'music', 'local'];

export const DESK_NAME: Record<Topic, string> = {
  news: 'News', politics: 'Politics', world: 'World', economy: 'Business', health: 'Health',
  tech: 'Science & Tech', climate: 'Climate', culture: 'Arts & Culture', music: 'Music', local: 'Around town',
};

// The mix bar's segment colors — decorative, never the only encoding (every segment also
// carries its name in text or a `title`, and MixBar's srOnly list gives the real numbers), but
// still worth ten distinct hues rather than a repeat a producer could mistake for one desk.
// The first eight are the dataviz skill's validated dark-mode categorical set
// (references/palette.md); the last two extend it to all ten desks. Checked with the skill's
// own validator against the adjacent-pairs list — the check it specifies for a stacked bar,
// and the same test the reference 8-hue set was validated against — on this component's
// actual dark surface (#1e2430): all ten pass lightness band, chroma floor, CVD separation
// and normal-vision separation. `node scripts/validate_palette.js
// "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767,#2f8fc9,#b5652f"
// --mode dark --pairs adjacent --surface "#1e2430"` → ALL CHECKS PASS.
export const DESK_COLOR: Record<Topic, string> = {
  news: '#3987e5', politics: '#d95926', world: '#199e70', economy: '#c98500',
  health: '#d55181', tech: '#008300', climate: '#9085e9', culture: '#e66767',
  music: '#2f8fc9', local: '#b5652f',
};

export type Desk = { topic: Topic; name: string; items: WireItem[] };
export type Mix = { total: number; shares: { topic: Topic; name: string; seconds: number; share: number }[]; lopsided: Topic | null };

export const byDesk = (items: WireItem[]): Desk[] =>
  DESK_ORDER
    .map((topic) => ({ topic, name: DESK_NAME[topic], items: items.filter((i) => i.topic === topic) }))
    .filter((d) => d.items.length > 0);

// What the producer actually built, by seconds rather than by story count: one 12-minute
// documentary is a bigger share of the hour than four 90-second spots.
export function mixOf(hour: Block[]): Mix {
  const real = hour.filter((b) => !b.fixed && !b.window && !b.credit && !b.music);
  const total = real.reduce((n, b) => n + (b.realLen ?? b.len), 0);
  const shares = DESK_ORDER
    .map((topic) => {
      const seconds = real.filter((b) => b.topic === topic).reduce((n, b) => n + (b.realLen ?? b.len), 0);
      return { topic, name: DESK_NAME[topic], seconds, share: total ? seconds / total : 0 };
    })
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  // Half the hour on one desk is the point at which a listener notices.
  const lopsided = shares[0] && shares[0].share > 0.5 ? shares[0].topic : null;
  return { total, shares, lopsided };
}
