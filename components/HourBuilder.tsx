'use client';
// The interactive hour: station picker, wire, rail, player and aircheck. Ported from
// prototype/index.html's DOM-manipulation script — same interaction, rebuilt as React state
// because this build streams real audio and reads a real day file instead of six fake ones.
//
// This is a client component, not `app/page.tsx` itself, because `getDay`/`getLatestDay`
// (lib/store.ts) sit behind `import 'server-only'` and can only run in a server component.
// `app/page.tsx` fetches the day file and hands it here as a prop; everything interactive
// lives in this one file to avoid splitting tightly-coupled state (the wire, the rail and the
// air button all read and write the same `hour` array) across files that would just pass it
// back and forth as props.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, DayFile, Topic, WireItem } from '@/lib/types';
import { BULLETIN, HOUR, layout, score, type FlashChoice } from '@/lib/hour';
import { previewSource } from '@/lib/preview';
import { arcs } from '@/lib/clock';
import { airBlocks, block, buildWire, legalIdBlock, placementNote } from '@/lib/wire';
import { toPlaylist } from '@/lib/playlist';
import { ALL_TOPICS, weightsFor } from '@/lib/taste';
import { airGate, countsForScore } from '@/lib/rules';
import { VOICES, DEFAULT_VOICE } from '@/lib/voices';
import { Player } from '@/components/Player';
import { Aircheck } from '@/components/Aircheck';
import { HotClock } from '@/components/HotClock';
import { Rules } from '@/components/Rules';
import { Wire, MixBar } from '@/components/Desks';
import styles from './HourBuilder.module.css';

const VOICE_KEY = 'nine-oclock-hour:voice';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function HourBuilder({ day }: { day: DayFile }) {
  const stationIds = useMemo(() => Object.keys(day.stations), [day]);
  const [home, setHome] = useState(stationIds[0]);
  const [picks, setPicks] = useState<Topic[]>([]);
  const [pledge, setPledge] = useState(false);
  // The opening block carries THIS station's recorded identification, so it is built from the
  // station rather than being one shared constant. Lazy initialiser: it would otherwise be
  // rebuilt on every render and thrown away.
  const [hour, setHour] = useState<Block[]>(() => [legalIdBlock(day.stations[stationIds[0]])]);
  const [flash, setFlash] = useState<FlashChoice | null>(null);
  const [flashPending, setFlashPending] = useState(false);
  const [airedHour, setAiredHour] = useState<Block[] | null>(null);
  const [drift, setDrift] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const [sheetItem, setSheetItem] = useState<WireItem | null>(null);
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE);
  const [auditioning, setAuditioning] = useState(false);
  const [auditionError, setAuditionError] = useState<string | null>(null);
  // Auditioning a story in place, rather than sending the producer to the publisher's website
  // and losing the hour they were building. One element for the session; publisher tape streams
  // from the newsroom's own server and nothing is copied here.
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewRef = useRef<HTMLAudioElement>(null);

  const station = day.stations[home];
  const wire = useMemo(() => buildWire(day, home), [day, home]);
  const plan = useMemo(() => layout(hour, pledge), [hour, pledge]);
  const left = HOUR + 60 - plan.end;
  // Why the air button is grey, and why a second underwriting credit will not go in. Both were
  // silent rules the producer could only discover by being stopped by them.
  const gate = airGate(hour);
  const hasCredit = hour.some((b) => b.credit);
  const ringArcs = useMemo(() => arcs(plan.rows), [plan.rows]);

  // Takes the station id because the hour now OPENS with something station-specific. Inside
  // changeStation below, `home` still holds the station the producer just left — React state is
  // not visible until the next render — so reading it here would rebuild the hour with the wrong
  // station's legal ID. Defaulted for the two "clear the hour" buttons, which stay where they are.
  function resetHour(id: string = home) {
    setHour([legalIdBlock(day.stations[id])]);
    setFlash(null);
    setFlashPending(false);
    setAiredHour(null);
    setDrift(null);
    setDone(false);
  }

  function changeStation(id: string) {
    setHome(id);
    resetHour(id);
  }

  // localStorage doesn't exist during SSR, so the initial render (and the server's HTML)
  // must use DEFAULT_VOICE; this syncs from the real preference right after mount, once
  // `window` exists. That's a genuine one-time sync with an external system, not derived
  // state — the lint rule wants `useSyncExternalStore` for this, which is real overkill for
  // a single string nobody else's code depends on reading reactively.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && (VOICES as readonly string[]).includes(saved)) setVoice(saved);
    } catch { /* private window or blocked storage — stick with DEFAULT_VOICE */ }
  }, []);

  function chooseVoice(v: string) {
    setVoice(v);
    try { localStorage.setItem(VOICE_KEY, v); } catch { /* nothing to persist to; the picker still works this session */ }
  }

  // Kept outside React state on purpose: `audio.play()` resolves once playback STARTS, not
  // once it ends, so the button re-enables while the sample is still talking. A ref (not
  // state) is how the next click finds and stops the previous Audio before starting a new
  // one — without it, a second click plays two voices at once, and the first one's object
  // URL never gets revoked until the tab closes.
  const auditionAudio = useRef<HTMLAudioElement | null>(null);

  // Voices one fixed sample line for a fraction of a cent — never the day's actual reads,
  // which are already voiced and cached by the 5 a.m. cron and can't be changed from here.
  async function audition() {
    setAuditioning(true);
    setAuditionError(null);
    try {
      const res = await fetch('/api/audition', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ voice }),
      });
      if (!res.ok) throw new Error(await res.text());
      const url = URL.createObjectURL(await res.blob());
      if (auditionAudio.current) {
        auditionAudio.current.pause();
        URL.revokeObjectURL(auditionAudio.current.src);
      }
      const audio = new Audio(url);
      auditionAudio.current = audio;
      // Both events, not just 'ended': a sample that errors out mid-playback (a bad decode,
      // the tab losing focus, whatever) must still release its object URL.
      const cleanup = () => URL.revokeObjectURL(url);
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      await audio.play();
    } catch (err) {
      // The friendly string is what a producer sees; the real one (an unknown-voice 400, a
      // Gemini 502, whatever) goes to the console so it's still reportable.
      console.error('audition failed:', err);
      setAuditionError('Could not audition that voice.');
    } finally {
      setAuditioning(false);
    }
  }

  function togglePick(t: Topic) {
    setPicks((prev) => (prev.includes(t) ? prev.filter((p) => p !== t) : prev.length < 3 ? [...prev, t] : prev));
  }

  function addToHour(item: WireItem, mode: 'tape' | 'read') {
    setHour((prev) => [...prev.filter((b) => b.id !== `${item.id}:tape` && b.id !== `${item.id}:read`), block(item, mode)]);
  }

  function removeFromHour(id: string) {
    setHour((prev) => prev.filter((b) => b.id !== id));
  }

  function addMusic(seconds: number) {
    setHour((prev) => [...prev, {
      id: `music-${Math.random().toString(36).slice(2)}`, label: 'Music bed', len: seconds,
      music: true, how: 'ours', kind: 'seg', mode: 'tape', topic: 'music',
    }]);
  }

  function addCredit() {
    setHour((prev) => (prev.some((b) => b.credit) ? prev : [...prev, {
      id: 'credit', label: pledge ? 'Underwriting credit (doubled)' : 'Underwriting credit', len: pledge ? 60 : 30,
      credit: true, how: 'ours', kind: 'seg', mode: 'read', topic: 'local',
    }]));
  }

  function togglePledge() {
    const next = !pledge;
    setPledge(next);
    setHour((prev) => prev.map((b) => (b.credit ? { ...b, len: next ? 60 : 30, label: next ? 'Underwriting credit (doubled)' : 'Underwriting credit' } : b)));
  }

  // Splice the bulletin into the hour (unless skipped) and roll the one drift number the
  // whole hour uses, then hand the result to <Player>. Scoring itself waits for onDone.
  function finalizeAir(choice: FlashChoice) {
    let finalHour = hour;
    if (choice !== 'skip') {
      const blk: Block = { ...BULLETIN, bulletin: true, how: 'satellite', kind: 'seg', mode: 'read' };
      let at = 0, i = hour.length;
      for (let n = 0; n < hour.length; n++) {
        at += hour[n].len;
        if (at >= BULLETIN.at) { i = choice === 'now' ? n + 1 : Math.min(n + 2, hour.length); break; }
      }
      finalHour = [...hour.slice(0, i), blk, ...hour.slice(i)];
    }
    setDrift(Math.round((Math.random() * 2 - 1) * 40));
    setAiredHour(finalHour);
  }

  function onPreview(item: WireItem) {
    const el = previewRef.current;
    const src = previewSource(item);
    if (!el || !src) return;
    if (previewId === item.id) { el.pause(); setPreviewId(null); return; }
    // Assigned only when it changes, and play() called SYNCHRONOUSLY inside the click: assigning
    // `src` runs the media load algorithm and aborts any play() in flight, and a play that
    // starts outside the gesture is refused on iOS. Same rule as cue() below.
    if (el.src !== src.url) el.src = src.url;
    setPreviewId(item.id);
    void el.play().catch(() => setPreviewId(null));
  }

  function handleAir() {
    if (!gate.ready) return;
    setFlashPending(true);
  }

  function chooseFlash(choice: FlashChoice) {
    setFlash(choice);
    setFlashPending(false);
    finalizeAir(choice);
  }

  // WHAT ACTUALLY AIRS, and it is not the same array the producer built. `airedHour` holds the
  // producer's own blocks plus the bulletin; the two 45-second windows are inserted by
  // `layout()`, which until now only fed the rail, the hot clock and the score. So the player
  // skipped both of them and the hour it played was ninety seconds shorter than the hour on the
  // rail beside it. `airBlocks` converts the laid-out rows into real Blocks, which is what puts
  // the weather recording into the 19:00 window — see lib/wire.ts for why the conversion has to
  // happen HERE, on the way to the player, and never inside `airedHour` itself (score() lays the
  // hour out again, and would insert a second set of windows on top of the first).
  //
  // Memoised, unlike the inline `toPlaylist(airedHour)` it replaces: <Player> lists `list` in the
  // dependencies of the effect that cues audio, so a fresh array on every parent render re-runs
  // that effect for no reason. It is safe when it happens — cue() only touches `src` when it
  // actually changes, and a read's timer settles through runClock on the way out — but not
  // re-running it at all is better than relying on both guards.
  const airedList = useMemo(
    () => (airedHour ? toPlaylist(airBlocks(layout(airedHour, pledge).rows, station)) : []),
    [airedHour, pledge, station],
  );

  const result = useMemo(() => {
    if (!done || !airedHour || drift === null || !flash) return null;
    const neighbour = day.stations[station.neighbour];
    return score(airedHour, { pledge, flash, drift, weights: weightsFor(picks), city: station.city, neighbour: neighbour?.name ?? station.neighbour });
  }, [done, airedHour, drift, flash, pledge, picks, day, station]);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <span className={`${styles.lamp} ${airedHour ? styles.lampLive : ''}`}>{airedHour ? 'On air' : 'Off air'}</span>
        <h1>{"Nine O'Clock Hour"}</h1>
        <label className={styles.picker}>
          You are working at{' '}
          <select value={home} onChange={(e) => changeStation(e.target.value)} aria-label="Choose your station">
            {stationIds.map((id) => (
              <option key={id} value={id}>{day.stations[id].name} — {day.stations[id].city}</option>
            ))}
          </select>
        </label>
        <p className={styles.hint}>
          Fill the nine o&rsquo;clock hour from what came in this morning, then put it on air.
          From the network feed on <span>{day.date}</span>.
        </p>
        <div className={styles.voicePicker}>
          <label className={styles.picker}>
            Audition voice{' '}
            <select value={voice} onChange={(e) => chooseVoice(e.target.value)}>
              {VOICES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <button type="button" className={styles.ghost} onClick={audition} disabled={auditioning}>
            {auditioning ? 'Auditioning…' : 'Audition'}
          </button>
          {auditionError && <span className={styles.auditionError} role="alert">{auditionError}</span>}
          <span className={styles.hint}>Preview only — the morning cron uses its own voice, set on the server.</span>
        </div>
      </header>

      {!airedHour && (
        <>
          {/* These four rights rules used to sit here permanently and read as background colour.
              They now live inside <Rules>, because the wire already answers each of them at the
              moment it matters -- a piece of tape that cannot be rolled has its Roll button
              disabled with the reason beside it (WHY_NOT, lib/wire.ts), and the story sheet
              spells the rest out per item (placementNote). Stating a rule once and enforcing it
              every time beats restating it above the fold forever. */}
          <Rules />

          {/* Ten buttons, five of which did nothing. weightsFor() records a weight for every
              topic, but score()'s retention walk reads that map on heavy blocks only, so a pick
              of tech, culture, climate, local or music could never move a number -- and the
              interface marked that difference with an asterisk. A producer spent two of his
              three picks on inert choices and only noticed when the aircheck did not move.

              Fixed structurally rather than typographically, and by REMOVING the affordance
              rather than disabling it: the five that count are the only five rendered as
              buttons, so a pick cannot be wasted at all. Disabling the other five would have
              left five dead controls to explain; dropping them silently would have left a
              producer wondering where the music desk went. They are named in the sentence
              underneath instead, with the reason they are not on offer.

              Nothing about scoring changes -- togglePick and weightsFor still take any topic. */}
          <div className={styles.topics}>
            <span id="topics-label">Who is listening? Pick up to three subjects you have patience for.</span>
            <div className={styles.topicRow} role="group" aria-labelledby="topics-label">
              {ALL_TOPICS.filter(countsForScore).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.topicBtn} ${picks.includes(t) ? styles.topicOn : ''}`}
                  onClick={() => togglePick(t)}
                  aria-pressed={picks.includes(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className={styles.topicsWhy}>
              A heavy story costs you a slice of the audience; one on a subject you picked costs
              you none. <b>Those five are the only subjects the tune-out model tracks.</b> The
              other desks on the wire — {new Intl.ListFormat('en').format(ALL_TOPICS.filter((t) => !countsForScore(t)))} —
              never cost anyone a listener, so there is nothing there to pick.
            </p>
          </div>

          <div className={styles.board}>
            <div>
              <Wire items={wire} hour={hour} degraded={day.degraded} onAdd={addToHour} onOpen={setSheetItem} onPreview={onPreview} playingId={previewId} />
            </div>

            <section>
              <div className={styles.railShell}>
                <div className={styles.rackLabel}><span>The hour</span><span>9:00 – 9:59</span></div>
                <HotClock arcs={ringArcs} />
                {/* The page assumed the trade's word for this diagram. It costs one line to say it,
                    and unlike the panel it cannot be dismissed. */}
                <p className={styles.ringNote}>Hot clock — where each element sits in the hour, clockwise from 9:00.</p>
                <MixBar hour={hour} />
                <div className={styles.readout}>
                  <span className={`${styles.big} ${left < 0 ? styles.bigOver : Math.abs(left) <= 5 ? styles.bigTight : ''}`}>
                    {left < 0 ? '+' : ''}{clock(Math.abs(left))}
                  </span>
                  <span className={styles.hint}>{left < 0 ? 'over — the network joins without you' : 'to fill'}</span>
                </div>
                <div className={styles.rail}>
                  {plan.rows.map(({ b, at }) => (
                    <div key={b.id} className={`${styles.blk} ${b.fixed ? styles.blkFixed : ''} ${'music' in b && b.music ? styles.blkMusic : ''} ${'window' in b && b.window ? styles.blkWindow : ''} ${'expired' in b && b.expired && b.mode === 'tape' ? styles.blkStale : ''}`}>
                      <span>{clock(at)}</span>
                      <span className={styles.who}>{b.label}{'mode' in b && b.mode === 'read' ? ' — read' : ''}</span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={'est' in b && b.est ? styles.blkEst : ''}>{'est' in b && b.est ? '≈' : ''}{clock(b.len)}</span>
                        {!b.fixed && <button type="button" onClick={() => removeFromHour(b.id)} aria-label={`Remove ${b.label}`}>×</button>}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.filler}>
                  <button type="button" onClick={() => addMusic(180)}>+ Music 3:00</button>
                  <button type="button" onClick={() => addMusic(270)}>+ Music 4:30</button>
                  <button type="button" onClick={() => addMusic(390)}>+ Music 6:30</button>
                  <button type="button" onClick={addCredit} disabled={hasCredit}>+ Underwriting 0:30</button>
                  <button type="button" className={pledge ? styles.pledgeOn : ''} onClick={togglePledge} aria-pressed={pledge}>Pledge week: {pledge ? 'on' : 'off'}</button>
                </div>
                {hasCredit && (
                  <p className={styles.fillerNote}>
                    One underwriting credit an hour, and it is already in. It has to clear by 9:30 to count.
                  </p>
                )}
                <button type="button" className={styles.air} disabled={!gate.ready} onClick={handleAir}>Put it on air</button>
                {!gate.ready && <p className={styles.airWhy}>{gate.reason}</p>}
                <button type="button" className={styles.ghost} onClick={() => resetHour()}>Clear the hour</button>
              </div>
            </section>
          </div>
        </>
      )}

      {airedHour && !done && (
        <div className={styles.playerDock}>
          <Player key={airedHour.map((b) => b.id).join('|')} list={airedList} station={station.name} onDone={() => setDone(true)} />
        </div>
      )}

      {airedHour && done && result && (
        <div className={styles.onAir}>
          <Aircheck result={result} hour={airedHour} day={day} />
          <button type="button" className={styles.ghost} onClick={() => resetHour()}>Build another hour</button>
        </div>
      )}

      <p className={styles.foot}>
        Headlines, runtimes, teasers and audio links come from each newsroom&rsquo;s own feed and play from their servers; nothing is copied or stored here.
      </p>

      {/* The session's one preview element. Publisher tape streams from the newsroom's own
          server; the only audio this project stores is audio it made itself. */}
      <audio ref={previewRef} preload="none" onEnded={() => setPreviewId(null)} />

      <BulletinModal open={flashPending} onChoose={chooseFlash} onDismiss={() => setFlashPending(false)} />
      <StorySheet item={sheetItem} onClose={() => setSheetItem(null)} />
    </div>
  );
}

// A native <dialog> opened with showModal() closes itself on Esc — no React state change
// requested it. Without `onClose` here, `flashPending` stayed true after Esc while the
// dialog's own `open` went false: pressing "Put it on air" again asked React to set
// `flashPending` to the value it already held, which bails out of the re-render, so the
// `[open]` effect never re-fires and showModal() never runs again. One keystroke, and the
// most important button in the product goes dead with no visible sign. `onDismiss` mirrors
// `StorySheet`'s existing `onClose` wiring below, and returns the producer to the desk with
// the air button still live — the bulletin is not decided by leaving it (see hour.ts: 'skip'
// costs 6 on-air and 4 freshness points, which Esc must never charge silently).
function BulletinModal({ open, onChoose, onDismiss }: { open: boolean; onChoose: (c: FlashChoice) => void; onDismiss: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className={styles.sheet} aria-labelledby="flash-title" onClose={onDismiss}>
      <p style={{ color: 'var(--red)' }}>Bulletin · 9:34 · 1:15</p>
      <h2 id="flash-title">The Fed has announced its decision.</h2>
      <p>Washington is up live in seventy-five seconds. Every station on the network is taking it. Your hour is already built, so something has to give.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" className={styles.ghost} onClick={() => onChoose('now')}>Take it live at 9:34 — everything after it shifts</button>
        <button type="button" className={styles.ghost} onClick={() => onChoose('late')}>Hold it for the next break — safer clock, older news</button>
        <button type="button" className={styles.ghost} onClick={() => onChoose('skip')}>Skip it — stay with what you planned</button>
      </div>
    </dialog>
  );
}

function StorySheet({ item, onClose }: { item: WireItem | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (item && !el.open) el.showModal();
    if (!item && el.open) el.close();
  }, [item]);
  return (
    <dialog ref={ref} className={styles.sheet} aria-labelledby="sheet-title" onClose={onClose}>
      {item && (
        <>
          <p>{item.src} · {item.when}{item.len ? ` · ${clock(item.len)}` : ''}</p>
          <h2 id="sheet-title">{item.title}</h2>
          <p>{item.teaser || 'No summary came with this one in the feed.'}</p>
          <p className={styles.look}>{placementNote(item)}</p>
          <div className={styles.sheetRow}>
            <a href={item.url} target="_blank" rel="noreferrer">Open the full story at the source →</a>
            <button type="button" className={styles.ghost} onClick={() => ref.current?.close()}>Close</button>
          </div>
        </>
      )}
    </dialog>
  );
}
