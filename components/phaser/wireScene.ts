// The wire strip, drawn. Everything that came in this morning, at a density you scan rather
// than read — see lib/strip.ts for why seeing is separated from opening.
//
// A factory rather than a class, because Phaser is 8.8MB and only ever reaches the browser
// through a dynamic import: there is no `Phaser` to extend at module scope.

import type * as PhaserNS from 'phaser';
import { DESK_COLOR } from '@/lib/desks';
import { stripLayout, STRIP_DEFAULTS } from '@/lib/strip';
import type { WireItem } from '@/lib/types';

// What you have already spent the morning on. Marked on the tiles because otherwise the strip
// cannot tell you the shape of your own morning: once hearing a story costs fifteen minutes,
// re-deciding a card you already paid for is a real way to lose the hour.
export type Marks = { readonly read: ReadonlySet<string>; readonly heard: ReadonlySet<string> };
export type ApplyMarks = (marks: Marks) => void;

export type WireSceneOpts = {
  readonly items: readonly WireItem[];
  // Measured from the page at boot. Not re-measured on resize: rebuilding the game to re-lay
  // the strip would take the sound manager with it and throw away the audio grant the tap
  // earned, which is a far worse trade than a rotated phone keeping its original column count.
  readonly width: number;
  readonly onPick: (id: string) => void;
  // Handed back once the tiles exist, so React can re-mark them WITHOUT rebuilding the game.
  // Recreating it would take the sound manager with it and throw away the audio grant the tap
  // already earned — the one thing this build is most careful about.
  readonly onReady: (apply: ApplyMarks) => void;
};

// The strip is sized to the space it actually has, not to a number picked on a laptop. At
// 320px — the narrowest phone still in use — a fixed 320 strip plus the page's own padding put
// a column of tiles 24px past the edge of the screen, where nothing could scroll to reach them.
// stripLayout() already takes a width and wraps to it; this is just telling it the truth.
export function wireSceneSize(items: readonly WireItem[], width = STRIP_DEFAULTS.width) {
  return { width, height: Math.max(200, stripLayout(items, { width }).height) };
}

export function makeWireScene(Phaser: typeof PhaserNS, opts: WireSceneOpts) {
  return class WireScene extends Phaser.Scene {
    create() {
      const strip = stripLayout(opts.items, { width: opts.width });
      // Two different SHAPES rather than two colours: a bar under a story you have read, a play
      // glyph on one you have heard. Colour is never the only signal in this codebase, and on a
      // 72px tile there is no room for a word.
      const readBars = new Map<string, PhaserNS.GameObjects.Rectangle>();
      const heardMarks = new Map<string, PhaserNS.GameObjects.Triangle>();

      for (const group of strip.groups) {
        // The desk NAME, not just its colour. lib/desks.ts reuses eight hues across ten desks
        // on purpose — music repeats news's blue, local repeats politics's orange — and is
        // explicit that a name beside the swatch is the disambiguator, never a border or a
        // texture. Without this line two pairs of desks would be indistinguishable.
        this.add.text(0, group.headerY, group.name.toUpperCase(), {
          fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#9a9a9a',
        });

        for (const tile of group.tiles) {
          const mark = this.add
            .rectangle(tile.x, tile.y, tile.w, tile.h, Phaser.Display.Color.HexStringToColor(DESK_COLOR[tile.topic]).color)
            .setOrigin(0, 0)
            .setInteractive({ useHandCursor: true });

          // Length is the only signal small enough to print here. Rights, freshness and the
          // untimed marker wait for the opened card, which is the whole point of the split.
          this.add.text(tile.x + tile.w / 2, tile.y + tile.h / 2, tile.time, {
            fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#ffffff',
          }).setOrigin(0.5);

          mark.on('pointerover', () => mark.setAlpha(0.75));
          mark.on('pointerout', () => mark.setAlpha(1));
          mark.on('pointerdown', () => opts.onPick(tile.id));

          // Added after the tile so they draw over it, and hidden until the morning is spent.
          readBars.set(
            tile.id,
            this.add.rectangle(tile.x, tile.y + tile.h - 3, tile.w, 3, 0xffffff).setOrigin(0, 0).setVisible(false),
          );
          heardMarks.set(
            tile.id,
            this.add.triangle(tile.x + tile.w - 11, tile.y + 4, 0, 0, 7, 4, 0, 8, 0xffffff).setOrigin(0, 0).setVisible(false),
          );
        }
      }

      opts.onReady((marks) => {
        for (const [id, bar] of readBars) bar.setVisible(marks.read.has(id));
        for (const [id, glyph] of heardMarks) glyph.setVisible(marks.heard.has(id));
      });
    }
  };
}
