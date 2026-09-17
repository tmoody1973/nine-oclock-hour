import type { Block, DayFile } from '@/lib/types';
import type { ScoreLabel, ScoreResult } from '@/lib/hour';
import { SCORES } from '@/lib/rules';
import styles from './Aircheck.module.css';

// The same five maxima the rules panel quotes before the hour airs (lib/rules.ts). Derived
// rather than restated: this card and that panel describing different hundreds is precisely
// the kind of quiet disagreement a producer would have to discover by arithmetic.
const MAX = Object.fromEntries(SCORES.map((s) => [s.label, s.max])) as Record<ScoreLabel, number>;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
// A text sparkline needs no chart library and no layout CSS: each minute's hold (20-100)
// maps to one of eight block-height characters. The glyphs render fine — verified on the real
// page, where a bad hour draws a visibly stepped curve — so this is not a font-coverage
// problem, whatever a solid bar looks like.
//
// The scale is ABSOLUTE on purpose, never fitted to the hour's own range: a good hour and a
// bad one have to look different from each other, and an auto-fitted curve would draw both
// with the same shape. The cost is that the top of the range is coarse — (95-20)/80*8 floors
// to 7, so every value from 95 up lands on the tallest block and a healthy hour draws as a
// flat bar. That is honest (nobody left) but it reads as a broken image, which is why the
// figures beside it carry the range the glyphs cannot resolve.
const BLOCKS = '▁▂▃▄▅▆▇█';
const sparkline = (curve: number[]) => curve.map((v) => BLOCKS[Math.min(7, Math.max(0, Math.floor(((v - 20) / 80) * 8)))]).join('');

// The end card: what you scored, why, and what the network's own rundown looked like next
// to it. Shown once the hour airs (Task 8 wires the trigger); nothing here plays audio.
export function Aircheck({ result, hour, day }: { result: ScoreResult; hour: Block[]; day: DayFile }) {
  const total = Object.values(result.scores).reduce((n, v) => n + v, 0);
  // Seeded with `low` so an hour with no curve at all can never produce -Infinity, the same
  // way result.low is seeded with 100 in lib/hour.ts.
  const high = Math.max(result.low, ...result.curve);
  // ONE branch, shared by the announced label and the visible caption below, so the two
  // cannot say different things. They used to: a perfectly flat curve read "steady at 100%"
  // on screen while a screen reader heard "100% at best and 100% at worst". Nobody has seen
  // that branch — it needs every minute of the hour to score identically — but this codebase
  // has been deliberate about the page and the screen reader agreeing.
  const steady = high === result.low;
  const retentionLabel = steady
    ? `Retention curve, steady at ${result.low}% the whole hour`
    : `Retention curve, ${high}% at best and ${result.low}% at worst`;
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
        <span className={`${styles.spark} figure`} role="img" aria-label={retentionLabel}>
          {sparkline(result.curve)}
        </span>{' '}
        {steady
          ? <>(steady at <span className="figure">{result.low}%</span> the whole hour)</>
          : <><span className="figure">{high}%</span> at best, bottomed at <span className="figure">{result.low}%</span></>}
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
