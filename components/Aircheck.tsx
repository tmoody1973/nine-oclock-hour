import type { Block, DayFile } from '@/lib/types';
import type { ScoreResult } from '@/lib/hour';
import styles from './Aircheck.module.css';

const MAX = { Clock: 30, 'On air': 25, Freshness: 15, Mix: 15, Hold: 15 } as const;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// A text sparkline needs no chart library and no layout CSS: each minute's hold (20-100)
// maps to one of eight block-height characters.
const BLOCKS = '▁▂▃▄▅▆▇█';
const sparkline = (curve: number[]) => curve.map((v) => BLOCKS[Math.min(7, Math.max(0, Math.floor(((v - 20) / 80) * 8)))]).join('');

// The end card: what you scored, why, and what the network's own rundown looked like next
// to it. Shown once the hour airs (Task 8 wires the trigger); nothing here plays audio.
export function Aircheck({ result, hour, day }: { result: ScoreResult; hour: Block[]; day: DayFile }) {
  const total = Object.values(result.scores).reduce((n, v) => n + v, 0);
  const rundown = day.network.filter((w) => w.src === 'Morning Edition');
  const missedTop = day.mostCarried.stations >= 2 && !hour.some((b) => b.label === day.mostCarried.title);

  return (
    <section aria-label="Aircheck" className={styles.aircheck}>
      <div className={styles.head}>Aircheck<span className={`${styles.total} figure`}>{total}/100</span></div>

      <div className={styles.scores}>
        {(Object.entries(result.scores) as [keyof typeof MAX, number][]).map(([label, value]) => (
          <div key={label} className={styles.score}>
            <div className={styles.l}>{label}</div>
            <div className={`${styles.n} figure`}>{value}<span>/{MAX[label]}</span></div>
          </div>
        ))}
      </div>

      <p className={styles.retention}>
        Who stayed, minute by minute:{' '}
        <span className={`${styles.spark} figure`} role="img" aria-label={`Retention curve, bottoming at ${result.low}%`}>
          {sparkline(result.curve)}
        </span>{' '}
        (bottomed at <span className="figure">{result.low}%</span>)
      </p>

      <ul className={styles.notes}>
        {result.notes.map(([kind, text, why], i) => (
          <li key={i}>
            <span className={`${styles.tag} ${styles[kind]}`}>{kind}</span>
            {/* Safe: every note is a string this codebase writes in lib/hour.ts. Three kinds of
                value get interpolated, and all three are ours: clock()/percentage output (formatted
                numbers), window labels from the hardcoded WINDOWS array, and the city/neighbour
                names from the hardcoded STATIONS object in lib/day.ts. None of them is a headline,
                teaser, or anything else that reached this build off the wire or from the listener.
                If a future note ever interpolates publisher copy or listener input, this becomes an
                injection hole and that note's text needs sanitising (or the <span> markup dropped)
                before it can keep using dangerouslySetInnerHTML. */}
            <span dangerouslySetInnerHTML={{ __html: text }} />
            {why && <small dangerouslySetInnerHTML={{ __html: why }} />}
          </li>
        ))}
      </ul>

      <div className={styles.rundown}>
        <p className={styles.rundownLabel}>What the network actually did</p>
        <ul>
          {rundown.map((w) => (
            <li key={w.id}>{w.title} — <span className="figure">{clock(w.len || w.est || 0)}</span></li>
          ))}
        </ul>
        {missedTop && <p className={styles.missed}>Every other newsroom carried &ldquo;{day.mostCarried.title}&rdquo;. You didn&rsquo;t.</p>}
      </div>
    </section>
  );
}
