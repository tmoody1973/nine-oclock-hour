// The wire strip: every item that came in, visible from five o'clock, at a density you can
// scan rather than read.
//
// WHY THIS SHAPE (decided with Tarik, 2026-09-17). Twenty-six full cards do not fit on a
// canvas at a size where the five signals are glanceable — roughly 35,000 pixels each before
// gaps, and hopeless at phone width. The tempting fix is to let the wire arrive in waves, but
// that spends the thing the game is built on: scarcity only bites when you can SEE what you
// are giving up, and "I should have run that Chicago piece" only teaches you anything if you
// saw it and passed. So seeing is separated from opening. Everything is here, small. A card
// becomes a full five-signal card only when you pull it out.
//
// Pure layout, no Phaser: the same reason docs/phaser-design.md puts the scrub mapping in
// lib/. It is testable without rendering and it survives the drawing being replaced.

import { byDesk, DESK_NAME } from './desks';
import { clock } from './player';
import type { Topic, WireItem } from './types';

export type Tile = {
  readonly id: string;
  readonly topic: Topic;
  // What the tile says out loud. Length is the one signal small enough to print here; the
  // other four wait for the opened card.
  readonly time: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type Group = {
  readonly topic: Topic;
  // CARRIES THE DESK IDENTITY, and is not decoration. DESK_COLOR deliberately reuses hues —
  // music repeats news's blue, local repeats politics's orange — and lib/desks.ts is explicit
  // that the disambiguator must be a NAME beside the swatch, never a border or a texture. A
  // strip that leaned on colour alone would make two pairs of desks indistinguishable and
  // quietly break "desk" as one of the five signals.
  readonly name: string;
  readonly headerY: number;
  readonly tiles: readonly Tile[];
};

export type Strip = { readonly groups: readonly Group[]; readonly height: number };

export type StripOpts = {
  width: number;
  tileW: number;
  tileH: number;
  gap: number;
  headerH: number;
  // Breathing room above the first desk heading. Without it that heading sits flush against
  // the top of the canvas and is visibly clipped — found by screenshotting the page, not by a
  // test, which is the whole argument for looking at the screen.
  padTop: number;
};

export const STRIP_DEFAULTS: StripOpts = { width: 320, tileW: 72, tileH: 28, gap: 6, headerH: 22, padTop: 10 };

// The length signal, and the `≈` the design calls for. An item with no duration in the feed is
// a genuine gamble — you find out how long it is while it is on the air — so it must never
// read as a confident number.
export function tileTime(item: WireItem): string {
  if (item.len > 0) return clock(item.len);
  if (item.est) return `≈${clock(item.est)}`;
  return 'text';
}

// Rows of tiles under a desk heading, in DESK_ORDER — "a front page has a shape a reader
// learns" (lib/desks.ts), so the order is the same every morning even as the stories change.
export function stripLayout(items: readonly WireItem[], opts: Partial<StripOpts> = {}): Strip {
  const o = { ...STRIP_DEFAULTS, ...opts };
  // At least one per row even if a caller hands us a width narrower than a tile: a zero here
  // would divide by zero below and lose every item silently, which is the failure mode this
  // whole module exists to avoid.
  const perRow = Math.max(1, Math.floor((o.width + o.gap) / (o.tileW + o.gap)));

  let y = o.padTop;
  const groups = byDesk([...items]).map((desk) => {
    const headerY = y;
    y += o.headerH;
    const tiles = desk.items.map((item, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      return {
        id: item.id,
        topic: item.topic,
        time: tileTime(item),
        x: col * (o.tileW + o.gap),
        y: y + row * (o.tileH + o.gap),
        w: o.tileW,
        h: o.tileH,
      };
    });
    const rows = Math.ceil(desk.items.length / perRow);
    y += rows * o.tileH + Math.max(0, rows - 1) * o.gap + o.gap * 2;
    return { topic: desk.topic, name: DESK_NAME[desk.topic], headerY, tiles };
  });

  return { groups, height: y };
}
