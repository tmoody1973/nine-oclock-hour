// The wire as a front page, and the bar that shows what the hour actually is. Both plain
// enough to render on the server; the click handlers that need a browser are passed in from
// `HourBuilder`, which is already the client boundary these live inside.
import type { Block, WireItem } from '@/lib/types';
import { byDesk, mixOf, DESK_NAME, DESK_COLOR } from '@/lib/desks';
import { HOW_LABEL, WHY_NOT, rollable, used } from '@/lib/wire';
import styles from './HourBuilder.module.css';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function Wire({ items, hour, degraded, onAdd, onOpen }: {
  items: WireItem[];
  hour: Block[];
  degraded?: string[];
  onAdd: (item: WireItem, mode: 'tape' | 'read') => void;
  onOpen: (item: WireItem) => void;
}) {
  // `degraded` carries two different kinds of marker (see lib/types.ts): a feed label like
  // "Morning Edition" when a newsroom didn't answer, and a `voice:<id>` entry when a read
  // was voiced. They read very differently to a producer, so they get two different lines
  // rather than one list that names a station and a cache key in the same breath.
  // Matched against the KNOWN internal prefixes, not "anything that isn't voice:". A one-sided
  // negation meant every new marker shape leaked into the feed line: `legalid:s921` rendered as
  // "We couldn't reach legalid:s921 this morning", inventing a newsroom that does not exist.
  // `sweep:reads` already did the same. Anything without a known prefix is a real feed label.
  const INTERNAL_MARKERS = ['voice:', 'legalid:', 'sweep:', 'wx:'];
  const feedFailures = degraded?.filter((d) => !INTERNAL_MARKERS.some((p) => d.startsWith(p))) ?? [];
  const voiceFailures = degraded?.filter((d) => d.startsWith('voice:')) ?? [];
  return (
    <>
      <div className={styles.rackLabel}><span>What came in</span><span>{items.length} items</span></div>
      {feedFailures.length > 0 && (
        <p className={styles.degraded}>
          We couldn&rsquo;t reach {new Intl.ListFormat('en').format(feedFailures)} this morning, so there&rsquo;s less here than usual.
        </p>
      )}
      {voiceFailures.length > 0 && (
        <p className={styles.degraded}>
          {voiceFailures.length} {voiceFailures.length === 1 ? 'read' : 'reads'} didn&rsquo;t get voiced this morning, so {voiceFailures.length === 1 ? 'it' : 'they'} will play silently if you use {voiceFailures.length === 1 ? 'it' : 'them'} today.
        </p>
      )}
      {byDesk(items).map((desk) => (
        <section key={desk.topic}>
          <h2 className={styles.rackLabel}>
            <span>{desk.name}</span>
            <span>{desk.items.length} {desk.items.length === 1 ? 'story' : 'stories'}</span>
          </h2>
          <div className={styles.wire}>
            {desk.items.map((w) => {
              const est = !w.len && w.est;
              const canRoll = rollable(w);
              const lenText = w.len ? clock(w.len) : est ? `≈ ${clock(w.est!)} untimed` : 'read';
              return (
                <article key={w.id} className={`${styles.item} ${used(hour, w) ? styles.itemUsed : ''}`}>
                  <div>
                    <h3><button type="button" onClick={() => onOpen(w)}>{w.title}</button></h3>
                    <p className={styles.meta}>
                      <span className={styles.src}>{w.src}</span>
                      <span>{w.when}</span>
                      <span>{lenText}</span>
                      <span className={`${styles.flag} ${w.how === 'satellite' || w.how === 'ours' ? styles.flagOk : styles.flagHold}`}>{HOW_LABEL[w.how]}</span>
                      {w.expires && <span>good until {w.expires}</span>}
                    </p>
                  </div>
                  <div className={styles.acts}>
                    <button type="button" disabled={!canRoll} onClick={() => onAdd(w, 'tape')}>
                      {w.len ? `Roll tape ${clock(w.len)}` : est ? `Roll it ≈ ${clock(w.est!)}` : 'No tape'}
                    </button>
                    <button type="button" onClick={() => onAdd(w, 'read')}>{w.how === 'station' ? 'Read with credit 0:30' : 'Read 0:30'}</button>
                    {!canRoll && <span className={styles.why}>{w.len || est ? WHY_NOT[w.how] : 'text only, nothing to roll'}</span>}
                  </div>
                  {w.url && (
                    <div className={styles.listen}>
                      <a href={w.url} target="_blank" rel="noreferrer">Audition at {w.src}</a>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}

export function MixBar({ hour }: { hour: Block[] }) {
  const mix = mixOf(hour);
  if (mix.total === 0) return null;
  return (
    <div className={styles.mixWrap}>
      <div className={styles.mixBar} aria-hidden="true">
        {mix.shares.map((s) => (
          <span
            key={s.topic}
            className={styles.mixSeg}
            style={{ width: `${s.share * 100}%`, background: DESK_COLOR[s.topic] }}
            title={`${s.name}: ${Math.round(s.seconds / 60)} min`}
          >
            {s.share > 0.12 ? s.name : ''}
          </span>
        ))}
      </div>
      {/* The legend, not the bar, is what actually tells two desks apart — the validated
          palette only has 8 hues for 10 desks, so a couple of swatches repeat, and hue alone
          can't disambiguate those. Every swatch here is paired with its own name and numbers,
          which is what a colour collision can't break. This is also plain visible text, not
          `aria-hidden`, so it's what a screen reader announces — no separate hidden list to
          keep in sync. */}
      <ul className={styles.mixLegend}>
        {mix.shares.map((s) => (
          <li key={s.topic}>
            <span className={styles.swatch} style={{ background: DESK_COLOR[s.topic] }} aria-hidden="true" />
            {s.name}: {Math.round(s.seconds / 60)} min ({Math.round(s.share * 100)}%)
          </li>
        ))}
      </ul>
      {/* A note, never a blocker — a producer is allowed to build a politics hour on purpose. */}
      {mix.lopsided && <p className={styles.mixNote}>More than half your hour is {DESK_NAME[mix.lopsided]}.</p>}
    </div>
  );
}
