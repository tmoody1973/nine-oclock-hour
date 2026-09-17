'use client';

// The wire does not hold still. NPR files all morning, and something better lands while the
// hour you built is already standing — docs/phaser-design.md calls this "the most game-like
// thing in the React app", and notes that there it fires exactly once.
//
// It still fires once here. Making it the RHYTHM of the morning is the design's ask and a
// bigger build; this is the honest minimum, because score() takes a FlashChoice and an
// aircheck that assumed one would be claiming you made a decision nobody offered you.
//
// Wording is the React build's, verbatim. Producers have read these three sentences already
// and there is no reason for a second version of them to exist.

import type { FlashChoice } from '@/lib/hour';

const CHOICES: readonly { choice: FlashChoice; label: string }[] = [
  { choice: 'now', label: 'Take it live at 9:34 — everything after it shifts' },
  { choice: 'late', label: 'Hold it for the next break — safer clock, older news' },
  { choice: 'skip', label: 'Skip it — stay with what you planned' },
];

export function Bulletin({ onChoose }: { onChoose: (c: FlashChoice) => void }) {
  return (
    <section aria-labelledby="bulletin-title" style={{ border: '2px solid #b3261e', borderRadius: 8, padding: 16, maxWidth: 520, display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, color: '#b3261e', fontSize: 12, letterSpacing: '0.06em' }}>Bulletin · 9:34 · 1:15</p>
      <h2 id="bulletin-title" style={{ margin: 0, fontSize: 17 }}>The Fed has announced its decision.</h2>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        Washington is up live in seventy-five seconds. Every station on the network is taking it. Your hour
        is already built, so something has to give.
      </p>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
        {CHOICES.map((c) => (
          <button key={c.choice} type="button" onClick={() => onChoose(c.choice)} style={{ padding: '8px 14px', fontSize: 13, textAlign: 'left' }}>
            {c.label}
          </button>
        ))}
      </div>
    </section>
  );
}
