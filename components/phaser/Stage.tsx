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
import { nothingToHear, previewSource, sourceNote } from '@/lib/preview';
import { BULLETIN, READ, layout, score, type FlashChoice } from '@/lib/hour';
import { toPlaylist } from '@/lib/playlist';
import { airGate } from '@/lib/rules';
import { weightsFor } from '@/lib/taste';
import { clock } from '@/lib/player';
import { CAN_ROLL, WHY_NOT, airBlocks, block, used } from '@/lib/wire';
import type { Block, WireItem } from '@/lib/types';
import { Card } from './Card';
import { Rundown } from './Rundown';
import { Bulletin } from './Bulletin';
import { Aircheck } from './Aircheck';
import { HourPlayer } from './HourPlayer';
import type { PlaceControl, PreviewControl, RemoveControl } from './card-controls';
import { STRIP_DEFAULTS } from '@/lib/strip';
import type { ApplyMarks } from './wireScene';

export default function Stage({ items, now, station }: {
  items: readonly WireItem[];
  now: number;
  // City and neighbouring station, purely so score() can phrase its notes in this station's
  // own terms — "an hour someone in Milwaukee could have heard anywhere".
  // City and neighbour are purely so score() can phrase its notes in this station's own terms.
  // `weather` is the morning's recorded forecast, which airBlocks() drops into the 19:00 window.
  station: { city: string; neighbour: string; weather?: string };
}) {
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
  // Stories already paid to hear. Preview is a FLAT price: once you have decided to listen,
  // sitting through the whole piece costs nothing extra — which matters because the hour is
  // meant to be a real news product, not something you sample and discard.
  const [heard, setHeard] = useState<ReadonlySet<string>>(() => new Set());
  const [playingId, setPlayingId] = useState<string | null>(null);
  // ONE element for the session, the way the React build kept one. Publisher tape streams from
  // the newsroom's own server; nothing is copied here.
  const audioRef = useRef<HTMLAudioElement>(null);
  // Re-marks the tiles in place. Held in a ref rather than rebuilt with the game, because
  // recreating the game would take the sound manager with it and throw away the audio grant.
  const applyMarksRef = useRef<ApplyMarks | null>(null);
  const [sceneReady, setSceneReady] = useState(0);
  // The hour as built so far. layout() turns it into a running order and reports what crashes
  // into what; nothing else needs to know the geometry.
  const [hour, setHour] = useState<readonly Block[]>([]);
  const [pendingAir, setPendingAir] = useState(false);
  const [flash, setFlash] = useState<FlashChoice | null>(null);
  // What actually aired: the producer's blocks plus the bulletin, if they took it. Held apart
  // from `hour` so the rundown keeps showing what they built.
  const [airedHour, setAiredHour] = useState<readonly Block[] | null>(null);
  // Untimed tape's real-world drift, rolled ONCE for the whole hour. Rolled in the handler and
  // never during render: score() must be deterministic for a given aired hour, and a fresh
  // random number on every re-render would make the card change while you read it.
  const [drift, setDrift] = useState<number | null>(null);

  const picked = useMemo(() => items.find((i) => i.id === pickedId) ?? null, [items, pickedId]);
  const paidFor = !!picked && read.has(picked.id);
  // Turning a card back over is free, and so is re-reading one you already paid for.
  const flipPrice = flipped || paidFor ? null : costOf('flip', spent);
  const flipBlocked = flipped || paidFor ? null : whyNot('flip', spent);

  // The strip is the only place you can see the shape of your own morning: which stories you
  // have paid to read, and which you have paid to hear.
  useEffect(() => {
    applyMarksRef.current?.({ read, heard });
  }, [read, heard, sceneReady]);

  const onPreview = useCallback(() => {
    if (!picked) return;
    const log = logRef.current;
    const el = audioRef.current;
    const src = previewSource(picked);
    if (!el || !src) return;

    if (playingId === picked.id) {
      el.pause();
      setPlayingId(null);
      log.record('preview stopped', picked.id);
      setLines(log.lines());
      return;
    }

    const paid = heard.has(picked.id);
    if (!paid && !canAfford('preview', spent)) return;

    // SYNCHRONOUS, INSIDE THE TAP, and before anything is awaited. This is the rule the React
    // build arrived at the hard way (docs/roadmap.md): let the gesture start something real,
    // and never build a priming step you then assume ran. An `await` above this line would
    // spend the gesture and iOS would refuse the play that follows.
    //
    // Assigning `src` runs the media load algorithm every time, even with an identical URL —
    // currentTime resets and any in-flight play() is aborted — so it is guarded, exactly as
    // cue() guards it in lib/player.ts.
    if (el.src !== src.url) el.src = src.url;
    void el
      .play()
      .then(() => { log.record('preview playing', `${src.what} · ${src.from}`); setLines(log.lines()); })
      .catch((e: Error) => {
        // A refusal must reach the screen, not the void. A control that looks responsive and
        // plays nothing is the exact failure this harness exists to make visible.
        log.record('preview REFUSED', e.message);
        setPlayingId(null);
        setLines(log.lines());
      });

    if (!paid) {
      setHeard((h) => new Set([...h, picked.id]));
      setSpent((sp) => spend('preview', sp));
    }
    setPlayingId(picked.id);

    // The diagnostic, AFTER the play() and never awaited before it. Phaser's own signals mean
    // "resume() resolved"; this reads the state back and says what is actually true.
    const sm = gameRef.current?.sound as PhaserNS.Sound.WebAudioSoundManager | undefined;
    if (sm?.context) {
      void unlock(sm.context).then((r) => {
        log.record('context during preview', `unlock=${r} state=${sm.context.state}`);
        setLines(log.lines());
      });
    }
  }, [picked, playingId, heard, spent]);

  const preview: PreviewControl = useMemo(() => {
    if (!picked) return { price: null, blocked: 'Nothing picked.', note: null, playing: false, onToggle: () => {} };
    const src = previewSource(picked);
    const paid = heard.has(picked.id);
    const playing = playingId === picked.id;
    return {
      price: paid || playing ? null : costOf('preview', spent),
      blocked: nothingToHear(picked) ?? (paid || playing ? null : whyNot('preview', spent)),
      note: src ? sourceNote(src) : null,
      playing,
      onToggle: onPreview,
    };
  }, [picked, heard, playingId, spent, onPreview]);

  const onPlace = useCallback((mode: 'tape' | 'read') => {
    if (!picked || used([...hour], picked)) return;
    if (!canAfford('place', spent)) return;
    setHour((h) => [...h, block(picked, mode, now)]);
    setSpent((sp) => spend('place', sp));
  }, [picked, hour, spent, now]);

  const place: PlaceControl = useMemo(() => {
    const noop = () => {};
    if (!picked) {
      return { price: null, already: false, tape: null, read: { label: 'Read 0:30', blocked: 'Nothing picked.' }, onPlace: noop };
    }
    const already = used([...hour], picked);
    const short = whyNot('place', spent);
    // There is tape to offer whenever the item has a runtime or an estimate; whether it may be
    // ROLLED is a rights question, and the answer is spelled out rather than greyed away.
    const hasTape = picked.len > 0 || !!picked.est;
    return {
      price: already ? null : costOf('place', spent),
      already,
      tape: hasTape
        ? {
            label: `Roll tape ${clock(picked.len || picked.est || 0)}`,
            blocked: CAN_ROLL[picked.how] ? short : (WHY_NOT[picked.how] ?? 'Not cleared to roll.'),
          }
        : null,
      // A read is always available: it is how another newsroom's story reaches air at all —
      // their reporting, our voice, their name on it.
      read: { label: `Read ${clock(READ)}`, blocked: short },
      onPlace: onPlace,
    };
  }, [picked, hour, spent, onPlace]);

  // Three items before an hour can air — lib/rules.ts owns that rule and the sentence that
  // explains it, so there is no second copy to fall out of step.
  const gate = useMemo(() => airGate([...hour]), [hour]);

  const chooseFlash = useCallback((choice: FlashChoice) => {
    setFlash(choice);
    setPendingAir(false);
    // Splice logic taken from the React build rather than re-derived: walk until the running
    // total reaches the bulletin's slot, then put it after that block if taken live, or one
    // block further on if held for the next break.
    let finalHour: readonly Block[] = hour;
    if (choice !== 'skip') {
      const blk: Block = { ...BULLETIN, bulletin: true, how: 'satellite', kind: 'seg', mode: 'read' };
      let at = 0;
      let i = hour.length;
      for (let n = 0; n < hour.length; n++) {
        at += hour[n].len;
        if (at >= BULLETIN.at) { i = choice === 'now' ? n + 1 : Math.min(n + 2, hour.length); break; }
      }
      finalHour = [...hour.slice(0, i), blk, ...hour.slice(i)];
    }
    setDrift(Math.round((Math.random() * 2 - 1) * 40));
    setAiredHour(finalHour);
  }, [hour]);

  // WHAT ACTUALLY AIRS, and it is not the array the producer built. `airedHour` holds their own
  // blocks plus the bulletin; the two 45-second windows are inserted by layout(). airBlocks()
  // turns those laid-out rows into real Blocks, which is what puts the recorded forecast into
  // the 19:00 window. This conversion happens HERE, on the way to the player, and never inside
  // `airedHour` — score() lays the hour out again and would insert a second set of windows on
  // top of the first. Carried over from the React build rather than rediscovered.
  const airedList = useMemo(
    () => (airedHour ? toPlaylist(airBlocks(layout([...airedHour], false).rows, { weather: station.weather })) : []),
    [airedHour, station],
  );

  const result = useMemo(() => {
    if (!airedHour || drift === null || !flash) return null;
    // No topic picker in this build yet, so no picks: weightsFor([]) is the generic listener,
    // who loses two points of patience to every heavy story. Honest rather than flattering.
    return score([...airedHour], {
      pledge: false, flash, drift, weights: weightsFor([]),
      city: station.city, neighbour: station.neighbour,
    });
  }, [airedHour, drift, flash, station]);

  const onRemove = useCallback((blockId: string) => {
    if (!canAfford('move', spent)) return;
    setHour((h) => h.filter((b) => b.id !== blockId));
    setSpent((sp) => spend('move', sp));
  }, [spent]);

  // One price for moving and for removing, rising through the morning: pulling at 5:30 is cheap
  // because you have hours to repair it, and pulling at 8:50 is not.
  const remove: RemoveControl = useMemo(
    () => ({ price: costOf('move', spent), blocked: whyNot('move', spent), onRemove }),
    [spent, onRemove],
  );

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

      // What the page can actually give the strip, capped at the design width so a desktop
      // does not stretch 72px tiles across half a monitor.
      const avail = Math.max(140, Math.min(STRIP_DEFAULTS.width, hostRef.current.clientWidth || STRIP_DEFAULTS.width));
      const size = wireSceneSize(items, avail);
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: size.width,
        height: size.height,
        backgroundColor: '#141414',
        scene: makeWireScene(Phaser, {
          items,
          width: avail,
          onReady: (apply) => {
            applyMarksRef.current = apply;
            // Bump rather than calling apply() here: the effect below owns marking, and calling
            // from inside create() would close over whatever `read`/`heard` were when the game
            // was built, which is not what is on screen by the time the tiles exist.
            setSceneReady((n) => n + 1);
          },
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', minWidth: 0 }}>
        {/* A real flex basis, and minWidth 0 so it may shrink below its own text. Without a
            basis this column sized itself to the widest line of copy in it — "Read 0 and heard
            0 of 26 stories." — and the strip, being width:100% of that, came out 198px wide at
            every screen size, phone and desktop alike. */}
        <div style={{ flex: `0 1 ${STRIP_DEFAULTS.width}px`, minWidth: 0 }}>
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
          {/* The same counts in words. The strip is a canvas — no labels, no focus order,
              nothing a screen reader can reach — so anything it says visually has to be said
              here too, or it is not said at all to half the people who might play. */}
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#555' }}>
            Read {read.size} and heard {heard.size} of {items.length} stories.
          </p>
          <div ref={hostRef} style={{ background: '#141414', width: '100%', maxWidth: STRIP_DEFAULTS.width }} />
        </div>

        {/* minWidth 0, not 300: a 300px floor put this column 28px past the edge of a 320px
            phone, with nothing able to scroll to reach it. The 340px basis still gives it a
            row of its own as soon as the screen is too narrow to sit beside the strip. */}
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          {picked ? (
            <Card item={picked} flipped={flipped} onFlip={onFlip} now={now} flipPrice={flipPrice} flipBlocked={flipBlocked} preview={preview} place={place} />
          ) : (
            <p style={{ margin: 0, color: '#666', maxWidth: '44ch' }}>
              Every story that came in this morning is in the strip, grouped by desk. Nothing is hidden —
              you simply cannot open all of it before nine. Pick one to see its five signals.
            </p>
          )}

          {/* Directly under the card, not at the foot of the page. You are building this hour
              while you read; having to scroll away from the wire to see what you have built is
              how you lose your place in it. */}
          <div style={{ marginTop: 20, display: 'grid', gap: 20 }}>
            <Rundown hour={hour} remove={remove} />

            {/* Nine o'clock. The gate's sentence comes from lib/rules.ts and is shown rather
                than the button simply refusing to work. */}
            {!airedHour && !pendingAir && (
              <div style={{ display: 'grid', gap: 6, justifyItems: 'start' }}>
                <button type="button" onClick={() => gate.ready && setPendingAir(true)} disabled={!gate.ready}
                        style={{ padding: '10px 18px', fontSize: 14 }}>
                  Put it on air
                </button>
                {gate.reason ? <p style={{ margin: 0, fontSize: 12, color: '#8a4b00' }}>{gate.reason}</p> : null}
              </div>
            )}

            {pendingAir && <Bulletin onChoose={chooseFlash} />}
            {airedHour && <HourPlayer list={airedList} />}
            {result && <Aircheck result={result} />}
          </div>
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

      {/* The session's one audio element. Publisher tape streams from the newsroom's own
          server — the only audio this project stores is audio it made itself. */}
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} preload="none" />

      {/* On screen rather than in the console: nobody has opened this on an iPhone, and a phone
          has no console to read. */}
      <pre aria-label="What the browser actually did" style={{ margin: 0, padding: 12, background: '#f4f4f4', color: '#111', fontSize: 12, overflowX: 'auto' }}>
        {lines.length ? lines.join('\n') : 'Nothing yet. Tap Play once, then read this.'}
      </pre>
    </div>
  );
}
