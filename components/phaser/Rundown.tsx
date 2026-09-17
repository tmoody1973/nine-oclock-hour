'use client';

// The hour as it currently stands, and what it will do when it airs.
//
// layout() (lib/hour.ts) has walked the hour and reported crashes since the engine was ported,
// and NOTHING has ever displayed them — the React build computes them only inside score(),
// after the fact. docs/phaser-design.md asks for the opposite: "the engine already knows that
// and can say so". Consequence while you build, not a verdict afterwards.

import { HOUR, crashLine, layout } from '@/lib/hour';
import { clock } from '@/lib/player';
import type { Block } from '@/lib/types';

// score() measures the landing against HOUR + 60 — 3540 plus the minute the legal ID occupies —
// so the hour a producer is aiming at ends at 60:00. Taken from there rather than hardcoded,
// so the two can never disagree about where the top of the hour is.
const TARGET_END = HOUR + 60;

export function Rundown({ hour }: { hour: readonly Block[] }) {
  const plan = layout([...hour], false);
  const off = plan.end - TARGET_END;

  return (
    <section style={{ display: 'grid', gap: 10, maxWidth: 520 }}>
      <h2 style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a8a' }}>
        The hour so far
      </h2>

      {hour.length === 0 ? (
        <p style={{ margin: 0, color: '#666' }}>
          Nothing in it yet. Open a story and offer it to the hour — roll the tape, or take it as a
          thirty-second read.
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
          {plan.rows.map((row, i) => {
            // The windows nobody may move, shown in the running order because their position is
            // the thing a producer is building around, not a detail behind a setting.
            const fixed = 'window' in row.b && row.b.window;
            return (
              <li
                key={`${row.b.id}-${i}`}
                style={{
                  display: 'flex', gap: 12, fontSize: 13, padding: '4px 6px',
                  background: fixed ? '#f0f0f0' : 'transparent',
                  fontStyle: fixed ? 'italic' : 'normal',
                }}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#555', minWidth: 46 }}>{clock(row.at)}</span>
                <span style={{ flex: 1 }}>{row.b.label}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#555' }}>{clock(row.b.len)}</span>
              </li>
            );
          })}
        </ol>
      )}

      {/* Where it lands. "At ten the network joins whether you are finished or not" — the one
          thing a producer cannot talk their way out of, so it is stated plainly and always. */}
      {hour.length > 0 && (
        <p style={{ margin: 0, fontSize: 13 }}>
          {off > 0
            ? `The hour runs ${clock(off)} long. At the top of the hour the network joins whether you are finished or not.`
            : off < -20
              ? `${clock(-off)} of dead air before the top of the hour. Silence is the fastest way to lose a listener.`
              : `It lands within ${clock(Math.abs(off))} of the top of the hour.`}
        </p>
      )}

      {plan.crashes.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {plan.crashes.map((c, i) => {
            const [headline, detail] = crashLine(c);
            return (
              // Consequence, not punishment — and it teaches the clock, which is the point.
              <div key={i} style={{ borderLeft: '3px solid #b3261e', paddingLeft: 10 }}>
                <p style={{ margin: 0, fontSize: 13 }}>{headline}</p>
                <p style={{ margin: 0, fontSize: 12, color: '#555' }}>{detail}</p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
