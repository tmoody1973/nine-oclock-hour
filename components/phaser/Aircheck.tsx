'use client';

// In radio an aircheck is the recording of your hour that you listen back to afterwards. The
// scorecard already carried the name; this is where it starts being true.
//
// Feedback, never a gate. docs/phaser-design.md is explicit: "A low score must still produce a
// good listen. If the scoring and the listening fight, the scoring loses." So this reports and
// explains; it never refuses anything.

import { SCORES } from '@/lib/rules';
import type { ScoreResult } from '@/lib/hour';

// score()'s notes carry <span class="figure"> so the React build could style the numbers. This
// build takes them plain rather than reaching for dangerouslySetInnerHTML: the strings are ours,
// not a listener's, but rendering markup by hand for emphasis alone is not worth the habit.
const plain = (s: string) => s.replace(/<[^>]+>/g, '');

const TONE: Record<'ok' | 'warn' | 'bad', string> = { ok: '#2e7d32', warn: '#8a4b00', bad: '#b3261e' };

export function Aircheck({ result }: { result: ScoreResult }) {
  const total = SCORES.reduce((n, s) => n + result.scores[s.label], 0);
  const outOf = SCORES.reduce((n, s) => n + s.max, 0);

  return (
    <section aria-labelledby="aircheck-title" style={{ display: 'grid', gap: 14, maxWidth: 520 }}>
      <h2 id="aircheck-title" style={{ margin: 0, fontSize: 17 }}>
        Aircheck — {total} out of {outOf}
      </h2>

      <div style={{ display: 'grid', gap: 10 }}>
        {SCORES.map((s) => (
          <div key={s.label} style={{ display: 'grid', gap: 2 }}>
            <p style={{ margin: 0, fontSize: 14 }}>
              <strong>{s.label}</strong>{' '}
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{result.scores[s.label]}/{s.max}</span>
            </p>
            {/* What the score is FOR, from lib/rules.ts — the same text the rules panel shows,
                so the card you get afterwards and the panel you read before cannot disagree
                about what a hundred is made of. */}
            <p style={{ margin: 0, fontSize: 12, color: '#555' }}>{s.what}</p>
          </div>
        ))}
      </div>

      {/* No line about result.low here on purpose. score() ALREADY emits a note about the
          retention curve's worst minute, and it phrases it two ways — "bottomed out at 62%"
          when the hour lost people, "never fell below 80%" when it held them. A second line
          stating the same number in a fixed voice sat directly above it saying the opposite
          thing about a good hour. The whole per-minute walk is in `result.curve`; drawing it is
          a chart and a separate piece of work. */}
      <div style={{ display: 'grid', gap: 8 }}>
        {result.notes.map(([tone, headline, detail], i) => (
          <div key={i} style={{ borderLeft: `3px solid ${TONE[tone]}`, paddingLeft: 10 }}>
            <p style={{ margin: 0, fontSize: 13 }}>{plain(headline)}</p>
            {detail ? <p style={{ margin: 0, fontSize: 12, color: '#555' }}>{plain(detail)}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
