'use client';

// The canvas scaffold. Built in the order docs/HANDOFF-2026-09-17-phaser.md asks for: the
// audio grant first, with the logging harness beside it, and the wire on top of that.
//
// The split, decided with Tarik on 2026-09-17: the STRIP is canvas — a dense field you scan,
// and where cards will later be dragged onto the clock — while an OPENED CARD is real DOM,
// because it carries the newsroom's credit and the link out to their story. See Card.tsx.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as PhaserNS from 'phaser';
import { unlock, type UnlockResult } from '@/lib/audio';
import { audioLog, disagreement } from '@/lib/audiolog';
import { MORNING_MINUTES, canAfford, costOf, morningClock, remaining, spend, whyNot } from '@/lib/morning';
import type { WireItem } from '@/lib/types';
import { Card } from './Card';

export default function Stage({ items, now }: { items: readonly WireItem[]; now: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<PhaserNS.Game | null>(null);
  const logRef = useRef(audioLog());
  const [lines, setLines] = useState<readonly string[]>([]);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  const [booted, setBooted] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  // Minutes of the morning already spent. Only actions spend it — no clock ticks while you
  // think, which is the whole point: this is a game about judgement. See lib/morning.ts.
  const [spent, setSpent] = useState(0);
  // Stories already read this morning. Reading one twice costs nothing, because a producer who
  // has read it has read it; the price is for the reading, not for the gesture.
  const [read, setRead] = useState<ReadonlySet<string>>(() => new Set());

  const picked = useMemo(() => items.find((i) => i.id === pickedId) ?? null, [items, pickedId]);
  const paidFor = !!picked && read.has(picked.id);
  // Turning a card back over is free, and so is re-reading one you already paid for.
  const flipPrice = flipped || paidFor ? null : costOf('flip', spent);
  const flipBlocked = flipped || paidFor ? null : whyNot('flip', spent);

  const onFlip = useCallback(() => {
    if (!picked) return;
    if (flipped) { setFlipped(false); return; }
    if (read.has(picked.id)) { setFlipped(true); return; }
    if (!canAfford('flip', spent)) return;
    // New Set rather than a mutation, per the immutability rule this codebase follows.
    setRead((r) => new Set([...r, picked.id]));
    setSpent((s) => spend('flip', s));
    setFlipped(true);
  }, [picked, flipped, read, spent]);

  useEffect(() => {
    // React runs effects twice in development and Phaser is not idempotent: a second
    // new Phaser.Game() against the same parent leaves two canvases and two sound managers,
    // and the second is the one gameRef keeps. `cancelled` covers the window where the dynamic
    // import is still in flight when cleanup runs.
    let cancelled = false;

    (async () => {
      // Imported here, never at module scope, so 8.8MB of engine reaches neither the server
      // nor the initial bundle. That is the whole reason this component is a client island.
      const Phaser = (await import('phaser')).default;
      const { makeWireScene, wireSceneSize } = await import('./wireScene');
      if (cancelled || !hostRef.current) return;

      const size = wireSceneSize(items);
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: size.width,
        height: size.height,
        backgroundColor: '#141414',
        scene: makeWireScene(Phaser, {
          items,
          onPick: (id) => {
            // A newly pulled card always lands signals-first. Flipping is a deliberate spend
            // of the morning, so it must never be inherited from the last card you read.
            setPickedId(id);
            setFlipped(false);
          },
        }),
      });
      logRef.current.record('game created', `phaser ${Phaser.VERSION} · ${items.length} items on the wire`);
      setBooted(true);
      setLines(logRef.current.lines());
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [items]);

  const onPlay = useCallback(async () => {
    const log = logRef.current;
    const show = () => setLines(log.lines());

    // WebAudioSoundManager is the only manager with a `context`. On the HTML5 fallback we are
    // back in the element's world, where the grant is unknowable — say so rather than
    // reporting a success nobody checked.
    const sm = gameRef.current?.sound as PhaserNS.Sound.WebAudioSoundManager | undefined;
    if (!sm || !('context' in sm) || !sm.context) {
      log.record('no Web Audio', 'HTML5 fallback — the grant cannot be verified on this path');
      setVerdict({ ok: false, text: 'No Web Audio here. Falling back to the element, where the grant is unknowable.' });
      show();
      return;
    }

    log.record('tap', `phaser.locked=${sm.locked} context.state=${sm.context.state}`);

    // INSIDE the gesture, with nothing awaited before it. See lib/audio.ts.
    const result: UnlockResult = await unlock(sm.context);
    log.record('unlock() returned', result);
    log.record('immediately after', `phaser.locked=${sm.locked} context.state=${sm.context.state}`);

    // Phaser clears `locked` on its next update() tick, not in resume()'s callback, so the line
    // above reads it a frame early. Recording both is the point: a tester should SEE the tick
    // clear it rather than wonder whether it did.
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
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a8a' }}>
            What came in — {items.length} items
          </h2>
          {/* The morning, spent rather than ticking. Both numbers are shown because the time of
              day is what a producer feels and the minutes left are what they can plan against. */}
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>
            <strong style={{ fontSize: 20 }}>{morningClock(spent)}</strong>
            {' · '}
            {remaining(spent)} of {MORNING_MINUTES} minutes left
          </p>
          <div ref={hostRef} style={{ background: '#141414' }} />
        </div>

        <div style={{ flex: '1 1 340px', minWidth: 300 }}>
          {picked ? (
            <Card item={picked} flipped={flipped} onFlip={onFlip} now={now} flipPrice={flipPrice} flipBlocked={flipBlocked} />
          ) : (
            <p style={{ margin: 0, color: '#666', maxWidth: '44ch' }}>
              Every story that came in this morning is in the strip, grouped by desk. Nothing is hidden —
              you simply cannot open all of it before nine. Pick one to see its five signals.
            </p>
          )}
        </div>
      </div>

      {/* A real DOM button over the canvas, not a painted rectangle: focusable, keyboard
          reachable, announced. Phaser's own unlock listens on document.body, so this click
          reaches it by bubbling. */}
      <button type="button" onClick={onPlay} disabled={!booted} style={{ padding: '12px 20px', fontSize: 16, width: 'fit-content' }}>
        {booted ? 'Play my hour' : 'Starting the engine…'}
      </button>

      {verdict && (
        <p role="status" style={{ margin: 0, color: verdict.ok ? '#2e7d32' : '#b3261e' }}>{verdict.text}</p>
      )}

      {/* On screen rather than in the console: nobody has opened this on an iPhone, and a phone
          has no console to read. */}
      <pre aria-label="What the browser actually did" style={{ margin: 0, padding: 12, background: '#f4f4f4', color: '#111', fontSize: 12, overflowX: 'auto' }}>
        {lines.length ? lines.join('\n') : 'Nothing yet. Tap Play once, then read this.'}
      </pre>
    </div>
  );
}
