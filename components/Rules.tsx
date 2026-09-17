'use client';
// How to play, shown once. A producer reads this on their first morning and never needs it
// again, so it remembers being dismissed and leaves a way back in.
//
// Deliberately NOT everything a newcomer asked about. Three of the four questions this panel
// was written for are answered better at the control that raised them -- the air button says
// why it is dead, the underwriting button says why a second one will not go in, the wire
// already says why a piece of tape cannot be rolled. A panel is for what genuinely needs
// saying once: what you are trying to do, what the ring is, and what you are scored on.
//
// Styles come from HourBuilder.module.css rather than a stylesheet of this component's own.
// Desks.tsx already does the same, and the tokens this needs are declared on `.wrap`, which is
// always this panel's ancestor -- a second copy of the palette would just be one more place
// for it to drift.
import { useEffect, useState } from 'react';
import { SCORES } from '@/lib/rules';
import styles from './HourBuilder.module.css';

const RULES_KEY = 'nine-oclock-hour:rules';

export function Rules() {
  // Three states, not two. `null` means "we have not read localStorage yet", which only
  // happens on the server render and the first client render -- localStorage does not exist
  // during SSR, so the alternative is to guess. Guessing "open" flashes the whole panel onto
  // the screen and rips it away again for every returning producer; guessing "closed" does the
  // same in reverse to a newcomer. Rendering nothing until we know costs a first-load layout
  // shift once, to the person who has never seen the page and is about to read it anyway.
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(localStorage.getItem(RULES_KEY) !== 'hidden');
    } catch {
      // Private window or blocked storage: show it. An expert re-closing this is a smaller
      // cost than a newcomer never seeing it.
      setOpen(true);
    }
  }, []);

  function choose(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(RULES_KEY, next ? 'shown' : 'hidden');
    } catch { /* nothing to persist to; the panel still opens and closes this session */ }
  }

  if (open === null) return null;

  if (!open) {
    return (
      <button type="button" className={styles.rulesOpen} onClick={() => choose(true)}>
        How this works
      </button>
    );
  }

  return (
    <section className={styles.rules} aria-labelledby="rules-title">
      <div className={styles.rulesHead}>
        <h2 id="rules-title">How this works</h2>
        <button type="button" className={styles.ghost} onClick={() => choose(false)}>Hide</button>
      </div>

      <p className={styles.rulesLede}>
        You are producing the nine o&rsquo;clock hour. Everything on the wire came in overnight.
        Build the hour, put it on air, and you are scored on what aired &mdash; not on what you planned.
      </p>

      <div className={styles.rulesGrid}>
        <div>
          <h3>The clock</h3>
          <p>
            Fifty-nine minutes of programming with a 1:00 legal ID on top. Three things are
            already on it and do not move: the legal ID at 9:00, weather at 9:19, traffic at 9:49.
            Run past ten and the network joins without you.
          </p>
          <p>
            The ring is a <b>hot clock</b> &mdash; where every element sits in the hour, read
            clockwise from the top. The list beside it is the same hour in running order.
          </p>
        </div>

        <div>
          <h3>What you owe</h3>
          <p>
            Two items of your own before the hour can air. One underwriting credit, and it has to
            clear by 9:30 &mdash; that is the money that paid for the hour, and it only counts
            inside the window.
          </p>
          <p>
            A newscast at the top is what nine in the morning is for. The current one, not the
            7 a.m. one.
          </p>
        </div>

        <div>
          <h3>What you may roll</h3>
          <p>
            <b>Network tape is yours.</b> NPR programs come down the satellite. Roll them.
          </p>
          <p>
            <b>Another station&rsquo;s tape is not.</b> Credit it and read it, or call them for the cut.
          </p>
          <p>
            <b>Podcast audio is not cleared for broadcast.</b> Talk about it, don&rsquo;t roll it.
          </p>
          <p>
            <b>Untimed tape has no duration in the feed.</b> Roll one and you find out live.
          </p>
        </div>
      </div>

      <h3 className={styles.rulesScoreHead}>Scored out of 100 when it airs</h3>
      <dl className={styles.rulesScores}>
        {SCORES.map((s) => (
          <div key={s.label}>
            <dt>{s.label} <span className="figure">{s.max}</span></dt>
            <dd>{s.what}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
