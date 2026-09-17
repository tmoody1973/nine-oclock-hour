'use client';

// A card pulled out of the strip. Five signals on the front, no sentences; flip it to read.
//
// DOM, not painted on the canvas. docs/phaser-design.md is unambiguous about why: in HTML a
// link is focusable, has a URL on hover, opens in a tab on middle-click, and is announced by a
// screen reader. In Phaser it is a rectangle somebody decided to make clickable. The newsroom's
// credit and its link out are a commitment this app makes in writing — "a newsroom's credit
// that cannot be clicked, copied, or read aloud is not much of a credit" — so the card that
// carries them is real markup over the canvas rather than pixels inside it.

import { DESK_COLOR, DESK_NAME } from '@/lib/desks';
import { clock } from '@/lib/player';
import { CAN_ROLL, HOW_LABEL, WHY_NOT, placementNote } from '@/lib/wire';
import type { WireItem } from '@/lib/types';

const cell: React.CSSProperties = { display: 'grid', gap: 2 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a8a' };
const value: React.CSSProperties = { fontSize: 14 };

// `now` is passed in rather than read here, following the same seam as block() in lib/wire.ts.
// Reading the clock during render is impure, and on this component it would also be a
// server/client hydration mismatch: freshness is decided once, on the server, at request time.
export function Card({ item, flipped, onFlip, now }: { item: WireItem; flipped: boolean; onFlip: () => void; now: number }) {
  const expired = !!item.expires && Date.parse(item.expires) < now;
  // The `≈` the design asks for: no duration in the feed means rolling it is a gamble, so it
  // must never render as a confident number.
  const length = item.len > 0 ? clock(item.len) : item.est ? `≈${clock(item.est)}` : 'text only';

  return (
    <article style={{ border: '1px solid #d8d8d8', borderRadius: 8, padding: 16, display: 'grid', gap: 14, background: '#fff', maxWidth: 520 }}>
      {!flipped ? (
        <>
          {/* FIVE SIGNALS, NO WORDS ON THE FRONT — desk, length, rights, freshness, untimed.
              "That is the skill the job actually needs", and it is what makes triage possible
              under a clock. */}
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div style={cell}>
              <span style={label}>Desk</span>
              <span style={{ ...value, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: DESK_COLOR[item.topic] }} />
                {DESK_NAME[item.topic]}
              </span>
            </div>
            <div style={cell}>
              <span style={label}>Length</span>
              <span style={{ fontSize: 30, lineHeight: 1 }}>{length}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div style={cell}>
              <span style={label}>Rights</span>
              {/* Never colour alone: the disabled state explains itself in text, the way the
                  React build did throughout. */}
              <span style={value}>
                {CAN_ROLL[item.how] ? `Yours to roll — ${HOW_LABEL[item.how]}` : WHY_NOT[item.how] ?? HOW_LABEL[item.how]}
              </span>
            </div>
            <div style={cell}>
              <span style={label}>Freshness</span>
              <span style={value}>{expired ? 'Expired' : item.old ? "Yesterday's" : 'Filed this morning'}</span>
            </div>
            {!item.len && item.est ? (
              <div style={cell}>
                <span style={label}>Untimed</span>
                <span style={value}>≈ nobody timed it</span>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <h2 style={{ margin: 0, fontSize: 17, lineHeight: 1.3 }}>{item.title}</h2>
          {/* Newscasts arrive with the headline repeated as the teaser, so rendering both is
              noise on exactly the items a producer scans most. */}
          {item.teaser && item.teaser.trim() !== item.title.trim()
            ? <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{item.teaser}</p>
            : null}
          <p style={{ margin: 0, fontSize: 13, color: '#555' }}>
            {item.src} · {item.when}
          </p>
          {/* The engine already writes this line; the card does not invent a second opinion. */}
          <p style={{ margin: 0, fontSize: 13, fontStyle: 'italic' }}>{placementNote(item)}</p>
          {/* A REAL ANCHOR. Their content, their audio, their link — the app's standing
              commitment, and the reason this card is not painted. WBEZ files no web link on
              any story, so lib/day.ts falls back to attributing the newsroom itself; when even
              that is missing, say so rather than rendering a dead link. */}
          {item.url ? (
            <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#1a56c4', textDecoration: 'underline' }}>
              Read it at {item.src}
            </a>
          ) : (
            <span style={{ fontSize: 13, color: '#8a8a8a' }}>No link filed for this story — {item.src}</span>
          )}
        </>
      )}

      <button type="button" onClick={onFlip} style={{ justifySelf: 'start', padding: '6px 12px', fontSize: 13 }}>
        {flipped ? 'Back to the signals' : 'Flip to read'}
      </button>
    </article>
  );
}
