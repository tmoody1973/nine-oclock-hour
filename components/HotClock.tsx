// The hot clock, drawn: a ring read clockwise from 12, in the vocabulary of NPR's own
// printed Morning Edition clock (task-11-brief.md), geometry from lib/clock.ts's `arcs()`.
//
// Accessibility decision, made deliberately (see the brief's four numbered defects to fix,
// not reproduce): the ring itself is `aria-hidden` -- a wedge diagram is not something a
// screen reader can read by nature, and it is not a control (no click handlers, no
// tabindex; the rail beside it is the only interactive surface). The same data renders a
// second way, as a visually-hidden <ol> of plain sentences, which is what assistive tech
// actually gets. A third, VISIBLE list -- the numbered running order -- is what a sighted
// person uses to resolve a bare number on a narrow wedge back to a name; it is not
// `aria-hidden` and not the hidden <ol>'s duplicate, it is its own compact, on-screen index.
// The fourth list, the class key, is the "what does this color/pattern mean" legend, one row
// per kind, not one row per element.
import type { Arc, ArcKind } from '@/lib/clock';
import styles from './HotClock.module.css';

const CX = 160;
const CY = 160;
const R_OUTER = 140;
const R_INNER = 78;
const TICK_R = 142;
// Wedges at least this wide get their name written directly on the ring, horizontally --
// never curved around the arc (WCAG 2.5.3 territory: text that only reads correctly rotated
// is text most people can't read at all). Narrower wedges get a number instead, resolved in
// the running-order list beside the ring.
const WIDE_DEG = 20;

// Color AND pattern together are the second channel color alone can't provide (never colour
// alone). Ordered here from lightest to darkest so KIND_ORDER below reads as a real luminance
// ramp -- roughly 0.93 down to 0.12 by perceived-luminance -- which is what actually survives
// a greyscale conversion; hue never does.
const KIND_META: Record<ArcKind, { name: string; color: string; pattern: string }> = {
  silence: { name: 'Silence', color: '#f0ede6', pattern: 'hc-fine-dot' },
  promo: { name: 'Promo', color: '#8fc3e6', pattern: 'hc-hatch' },
  segment: { name: 'Segment', color: '#8b93a3', pattern: 'hc-solid' },
  window: { name: 'Weather or traffic window', color: '#3f7f7a', pattern: 'hc-open' },
  bed: { name: 'Music bed', color: '#45506b', pattern: 'hc-dot' },
  credit: { name: 'Funding credit', color: '#6e1f1f', pattern: 'hc-hatch-rev' },
  newscast: { name: 'Newscast', color: '#1b1f27', pattern: 'hc-cross' },
};
const KIND_ORDER: ArcKind[] = ['silence', 'promo', 'segment', 'window', 'bed', 'credit', 'newscast'];

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// 0 degrees is 12 o'clock; increasing degrees runs clockwise (screen y grows downward, so
// this is the mirror of the usual math-angle convention on purpose).
//
// Rounded to 2 decimals on the way out -- found the hard way (a real hydration mismatch,
// caught in the Next.js dev overlay while checking this in a browser). Math.sin/Math.cos are
// library-approximated, not spec-guaranteed bit-identical, and Node's V8 (server render) and
// Chrome's V8 (client render) can return results a few ULPs apart for the same input. Left
// unrounded, that shows up as two different decimal strings for the same coordinate --
// "255.0165461029579" vs "255.01654610295788" -- which is a real server/client HTML mismatch,
// not a false alarm. Rounding uses only multiplication and Math.round, both plain IEEE-754
// ops that ARE bit-identical everywhere, so it collapses the sub-hundredth-of-a-pixel gap into
// the exact same string on both sides.
const round2 = (n: number) => Math.round(n * 100) / 100;
function polar(r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: round2(CX + r * Math.sin(rad)), y: round2(CY - r * Math.cos(rad)) };
}

function wedgePath(a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const o0 = polar(R_OUTER, a0);
  const o1 = polar(R_OUTER, a1);
  const i1 = polar(R_INNER, a1);
  const i0 = polar(R_INNER, a0);
  return `M ${o0.x} ${o0.y} A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${o1.x} ${o1.y} L ${i1.x} ${i1.y} A ${R_INNER} ${R_INNER} 0 ${large} 0 ${i0.x} ${i0.y} Z`;
}

const MINUTE_TICKS = Array.from({ length: 60 }, (_, m) => m);

export function HotClock({ arcs }: { arcs: Arc[] }) {
  return (
    <div className={styles.wrap}>
      <svg viewBox="0 0 320 320" className={styles.ring} aria-hidden="true">
        {/* Pattern fills defined once, referenced by both the ring's wedges and the legend's
            small swatch <svg>s below -- SVG paint-server ids resolve document-wide, not just
            inside this <svg>, so one <defs> serves both. */}
        <defs>
          <pattern id="hc-solid" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={KIND_META.segment.color} />
          </pattern>
          <pattern id="hc-cross" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={KIND_META.newscast.color} />
            <path d="M0 0 L8 8 M8 0 L0 8" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
          </pattern>
          <pattern id="hc-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill={KIND_META.promo.color} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.3)" strokeWidth="2" />
          </pattern>
          <pattern id="hc-dot" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill={KIND_META.bed.color} />
            <circle cx="4" cy="4" r="1.6" fill="rgba(255,255,255,0.5)" />
          </pattern>
          <pattern id="hc-hatch-rev" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <rect width="8" height="8" fill={KIND_META.credit.color} />
            <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
          </pattern>
          <pattern id="hc-open" width="10" height="10" patternUnits="userSpaceOnUse">
            <rect width="10" height="10" fill={KIND_META.window.color} />
            <circle cx="5" cy="5" r="2.6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
          </pattern>
          <pattern id="hc-fine-dot" width="6" height="6" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill={KIND_META.silence.color} />
            <circle cx="3" cy="3" r="0.6" fill="rgba(0,0,0,0.35)" />
          </pattern>
        </defs>

        {MINUTE_TICKS.map((m) => {
          const major = m % 5 === 0;
          const p1 = polar(TICK_R, m * 6);
          const p2 = polar(TICK_R + (major ? 13 : 6), m * 6);
          return <line key={m} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--edge, #3c4557)" strokeWidth={major ? 1.5 : 1} />;
        })}
        <text x={CX} y={24} textAnchor="middle" fontSize="10" letterSpacing="0.08em" fill="var(--fgSoft, #98a1b1)">START</text>

        {arcs.map((a, i) => {
          const meta = KIND_META[a.kind];
          const wide = a.a1 - a.a0 >= WIDE_DEG;
          const mid = polar((R_OUTER + R_INNER) / 2, (a.a0 + a.a1) / 2);
          return (
            <g key={a.id} className={styles.arc}>
              <path
                d={wedgePath(a.a0, a.a1)}
                fill={`url(#${meta.pattern})`}
                stroke="var(--panel, #171b24)"
                strokeWidth={1}
                strokeDasharray={a.minWidthApplied ? '3 2' : undefined}
              />
              {/* Horizontal, never rotated to follow the arc -- a wide wedge gets its own
                  name because it fits without curving; a narrow one gets only its number,
                  resolved in the visible running-order list. */}
              <text
                x={mid.x}
                y={mid.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={wide ? 9 : 8}
                fill="#fff"
                stroke="rgba(0,0,0,0.6)"
                strokeWidth={2}
                paintOrder="stroke"
              >
                {wide ? a.label : i + 1}
              </text>
            </g>
          );
        })}
      </svg>

      <div className={styles.side}>
        <ol className={styles.order}>
          {arcs.map((a, i) => (
            <li key={a.id}>
              <span className={styles.num}>{i + 1}</span>
              {a.label} — {clock(a.startAt)} for {clock(a.seconds)}
              {a.minWidthApplied && <span className={styles.floored}> (shown wider on the ring)</span>}
            </li>
          ))}
        </ol>

        <ul className={styles.key}>
          {KIND_ORDER.map((k) => (
            <li key={k}>
              <svg width="14" height="14" aria-hidden="true">
                <rect width="14" height="14" fill={`url(#${KIND_META[k].pattern})`} />
              </svg>
              {KIND_META[k].name}
            </li>
          ))}
        </ul>
      </div>

      {/* The actual accessible running order -- full sentences, not the compact list above,
          since a screen reader user gets this instead of the picture, not alongside a
          picture they can already see. */}
      <ol className={styles.srOnly}>
        {arcs.map((a) => (
          <li key={a.id}>
            {a.label}, starts {clock(a.startAt)}, runs {clock(a.seconds)}, {KIND_META[a.kind].name.toLowerCase()}.
            {a.minWidthApplied ? ' Shown larger on the ring so it is visible.' : ''}
          </li>
        ))}
      </ol>
    </div>
  );
}
