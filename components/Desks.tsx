// The wire as a front page, and the bar that shows what the hour actually is. Both plain
// enough to render on the server; the click handlers that need a browser are passed in from
// `HourBuilder`, which is already the client boundary these live inside.
import type { Block, Topic, WireItem } from '@/lib/types';
import { byDesk, mixOf, DESK_NAME } from '@/lib/desks';
import { HOW_LABEL, WHY_NOT, rollable, used } from '@/lib/wire';
import styles from './HourBuilder.module.css';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// The dataviz skill's validated 8-hue dark-mode categorical set (references/palette.md),
// in DESK_ORDER. Only 8 hues clear the colorblind-safety gates as an ordered set, and there
// are 10 desks, so the last two (music, local) repeat earlier hues.
// ponytail: color here is decorative, never the only encoding — every segment also carries
// its name in text or a `title` — so the rare repeat costs nothing worth a 9th validated hue.
const DESK_COLOR: Record<Topic, string> = {
  news: '#3987e5', politics: '#d95926', world: '#199e70', economy: '#c98500',
  health: '#d55181', tech: '#008300', climate: '#9085e9', culture: '#e66767',
  music: '#3987e5', local: '#d95926',
};

export function Wire({ items, hour, degraded, onAdd, onOpen }: {
  items: WireItem[];
  hour: Block[];
  degraded?: string[];
  onAdd: (item: WireItem, mode: 'tape' | 'read') => void;
  onOpen: (item: WireItem) => void;
}) {
  return (
    <>
      {degraded && degraded.length > 0 && (
        <p className={styles.degraded}>
          We couldn&rsquo;t reach {new Intl.ListFormat('en').format(degraded)} this morning, so there&rsquo;s less here than usual.
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
      <ul className={styles.srOnly}>
        {mix.shares.map((s) => (
          <li key={s.topic}>{s.name}: {Math.round(s.seconds / 60)} minutes, {Math.round(s.share * 100)}% of the hour</li>
        ))}
      </ul>
      {/* A note, never a blocker — a producer is allowed to build a politics hour on purpose. */}
      {mix.lopsided && <p className={styles.mixNote}>More than half your hour is {DESK_NAME[mix.lopsided]}.</p>}
    </div>
  );
}
