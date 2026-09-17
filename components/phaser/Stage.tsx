'use client';

// The Phaser scaffold, built in the order docs/HANDOFF-2026-09-17-phaser.md asks for: the
// audio grant first, with the logging harness beside it, before anything is stacked on top.
// There are no cards here yet on purpose. This path has broken three times.

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as PhaserNS from 'phaser';
import { unlock, type UnlockResult } from '@/lib/audio';
import { audioLog, disagreement } from '@/lib/audiolog';

const WIDTH = 960;
const HEIGHT = 540;

export default function Stage() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  const logRef = useRef(audioLog());
  const [lines, setLines] = useState<readonly string[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // React runs effects twice in development, and Phaser is not idempotent: a second
    // new Phaser.Game() against the same parent leaves two canvases and two sound managers,
    // and the second one is the one `gameRef` keeps. `cancelled` covers the window where the
    // dynamic import is still in flight when the cleanup runs.
    let cancelled = false;

    (async () => {
      // Imported here rather than at module scope so 8.8MB of engine never reaches the
      // server or the initial bundle — the whole reason this component is a client island.
      const Phaser = (await import('phaser')).default;
      if (cancelled || !hostRef.current) return;

      class Boot extends Phaser.Scene {
        create() {
          this.add.text(WIDTH / 2, HEIGHT / 2 - 30, "Nine O'Clock Hour", {
            fontFamily: 'ui-monospace, monospace', fontSize: '34px', color: '#f4f4f4',
          }).setOrigin(0.5);
          this.add.text(WIDTH / 2, HEIGHT / 2 + 20, 'Scaffold. Audio grant first, cards after.', {
            fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#8a8a8a',
          }).setOrigin(0.5);
        }
      }

      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: '#101010',
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
        scene: Boot,
      });
      logRef.current.record('game created', `phaser ${Phaser.VERSION}`);
      setBooted(true);
      setLines(logRef.current.lines());
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const onPlay = useCallback(async () => {
    const log = logRef.current;
    const show = () => setLines(log.lines());

    // WebAudioSoundManager is the only manager with a `context`. If the browser fell back to
    // HTML5 audio, we are back to the element's world and cannot verify anything — say so
    // rather than reporting a grant nobody checked.
    const sm = gameRef.current?.sound as PhaserNS.Sound.WebAudioSoundManager | undefined;
    if (!sm || !('context' in sm) || !sm.context) {
      log.record('no Web Audio', 'HTML5 fallback — the grant cannot be verified on this path');
      setVerdict({ ok: false, text: 'No Web Audio on this browser. Falling back to the element, where the grant is unknowable.' });
      show();
      return;
    }

    log.record('tap', `phaser.locked=${sm.locked} context.state=${sm.context.state}`);

    // INSIDE the gesture, with nothing awaited before it. See lib/audio.ts.
    const result: UnlockResult = await unlock(sm.context);
    log.record('unlock() returned', result);
    log.record('immediately after', `phaser.locked=${sm.locked} context.state=${sm.context.state}`);

    // Phaser clears `locked` on its next update() tick, not in the resume callback, so reading
    // it on the line above is reading it a frame early. Recording both is the point: a tester
    // watching this log should be able to SEE the tick clear it, rather than wonder.
    requestAnimationFrame(() => {
      log.record('one frame later', `phaser.locked=${sm.locked} context.state=${sm.context.state}`);
      const d = disagreement(!sm.locked, sm.context.state);
      if (d) log.record('DISAGREEMENT', d);
      setVerdict(
        sm.context.state === 'running'
          ? { ok: true, text: 'The grant landed. context.state is "running" — sound is genuinely possible, checked rather than assumed.' }
          : { ok: false, text: d ?? `The grant did NOT land. context.state is "${sm.context.state}".` },
      );
      show();
    });
    show();
  }, []);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div ref={hostRef} style={{ width: '100%', maxWidth: WIDTH, aspectRatio: `${WIDTH} / ${HEIGHT}`, background: '#101010' }} />

      {/* A real DOM button over the canvas, not a painted rectangle. Phaser's own unlock
          listens on document.body, so this click reaches it by bubbling — and unlike a
          drawn rectangle it is focusable, reachable by keyboard, and announced by a screen
          reader. docs/phaser-design.md requires this for links; starting as we mean to go on. */}
      <button type="button" onClick={onPlay} disabled={!booted} style={{ padding: '12px 20px', fontSize: 16, width: 'fit-content' }}>
        {booted ? 'Play my hour' : 'Starting the engine…'}
      </button>

      {verdict && (
        <p role="status" style={{ margin: 0, color: verdict.ok ? '#2e7d32' : '#b3261e' }}>
          {verdict.text}
        </p>
      )}

      {/* The log, on screen rather than in the console: nobody has opened this on an iPhone,
          and a phone has no console to read. */}
      <pre aria-label="What the browser actually did" style={{ margin: 0, padding: 12, background: '#f4f4f4', color: '#111', fontSize: 12, overflowX: 'auto' }}>
        {lines.length ? lines.join('\n') : 'Nothing yet. Tap Play once, then read this.'}
      </pre>
    </div>
  );
}
