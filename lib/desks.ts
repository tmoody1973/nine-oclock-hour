import type { Block, Topic, WireItem } from './types';

// A front page has a shape a reader learns. This order is deliberate: not alphabetical,
// not by how many stories happen to have landed.
export const DESK_ORDER: Topic[] = ['news', 'politics', 'world', 'economy', 'health', 'tech', 'climate', 'culture', 'music', 'local'];

export const DESK_NAME: Record<Topic, string> = {
  news: 'News', politics: 'Politics', world: 'World', economy: 'Business', health: 'Health',
  tech: 'Science & Tech', climate: 'Climate', culture: 'Arts & Culture', music: 'Music', local: 'Around town',
};

// The mix bar's segment colors. This is the dataviz skill's validated 8-hue dark-mode
// categorical set (references/palette.md), unmodified — it exists precisely so nobody has to
// invent a 9th and 10th hue and hope it holds up, so this doesn't. Ten desks, eight hues means
// music repeats news's blue and local repeats politics's orange; the two collided pairs are
// disambiguated on screen by MixBar's legend (a name and numbers beside every swatch), which
// is the mechanism the skill actually specifies for identity beyond hue — not a border or a
// texture, both of which the skill rules out for this ("never draw a border to separate a
// mark"; texture is opt-in for an accessibility setting/print/forced-colors, "never on by
// default").
export const DESK_COLOR: Record<Topic, string> = {
  news: '#3987e5', politics: '#d95926', world: '#199e70', economy: '#c98500',
  health: '#d55181', tech: '#008300', climate: '#9085e9', culture: '#e66767',
  music: '#3987e5', local: '#d95926',
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
