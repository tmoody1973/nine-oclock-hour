// The wire strip, drawn. Everything that came in this morning, at a density you scan rather
// than read — see lib/strip.ts for why seeing is separated from opening.
//
// A factory rather than a class, because Phaser is 8.8MB and only ever reaches the browser
// through a dynamic import: there is no `Phaser` to extend at module scope.

import type * as PhaserNS from 'phaser';
import { DESK_COLOR } from '@/lib/desks';
import { stripLayout, STRIP_DEFAULTS } from '@/lib/strip';
import type { WireItem } from '@/lib/types';

export type WireSceneOpts = {
  readonly items: readonly WireItem[];
  readonly onPick: (id: string) => void;
};

export function wireSceneSize(items: readonly WireItem[]) {
  return { width: STRIP_DEFAULTS.width, height: Math.max(200, stripLayout(items).height) };
}

export function makeWireScene(Phaser: typeof PhaserNS, opts: WireSceneOpts) {
  return class WireScene extends Phaser.Scene {
    private marks: PhaserNS.GameObjects.Rectangle[] = [];

    create() {
      const strip = stripLayout(opts.items);

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
          this.marks.push(mark);
        }
      }
    }
  };
}
