// How to play, as facts rather than prose. Everything here is something the page already
// enforced silently: the count that greys out the air button, the five scores you only saw
// after airing, and which topic picks can move a score at all.
//
// It lives in lib/ rather than in the panel component for one reason -- the panel is the place
// most likely to start lying. A sentence in a component drifts away from the engine it
// describes and nothing goes red; these are pinned to lib/hour.ts by lib/rules.test.ts, so a
// renamed score or a moved threshold breaks a test instead of quietly misinforming a producer.
import type { Block, Topic } from './types';
import { HEAVY_TOPICS, type ScoreLabel } from './hour';

// The gate HourBuilder disables "Put it on air" on. Three BLOCKS, which is not three rows on
// the rail: a new hour already renders the legal ID plus the weather and traffic windows, and
// the two windows are drawn by layout() and never enter `hour`. So the rail reads three and the
// button is still dead. This is the number, kept here so the button and the sentence under it
// can never come from two different constants.
export const MIN_HOUR_BLOCKS = 3;

export type AirGate = { ready: boolean; need: number; reason: string };

// Counted in the only unit a producer controls -- items they put in themselves -- because the
// hour is seeded with the legal ID they did not add and cannot remove. Saying "three blocks"
// is true of the array and useless at the desk.
const WORDS = ['no more', 'one more', 'two more'] as const;

export function airGate(hour: Block[]): AirGate {
  const need = Math.max(0, MIN_HOUR_BLOCKS - hour.length);
  if (!need) return { ready: true, need: 0, reason: '' };
  const word = WORDS[need] ?? `${need} more`;
  return {
    ready: false,
    need,
    reason: `Add ${word} ${need === 1 ? 'item' : 'items'} from the wire before this hour can go to air.`,
  };
}

// A pick only moves a score if score()'s retention walk reads its weight, and that walk reads
// weights on heavy blocks only (lib/hour.ts). The other five topics are recorded by weightsFor()
// and never consulted -- see the comment in lib/taste.ts. The picker asks this rather than
// re-deriving it, so there is no second copy of the list to fall out of step.
export function countsForScore(topic: Topic): boolean {
  return HEAVY_TOPICS.includes(topic);
}

// The scoreboard, in the engine's own order and out of the engine's own maxima. The aircheck
// reads these maxima too, so the card you get after airing and the panel you read before it
// cannot disagree about what 100 is made of.
export const SCORES: readonly { label: ScoreLabel; max: number; what: string }[] = [
  { label: 'Clock', max: 30, what: 'Land on the top of the hour. Run long and the network joins without you.' },
  { label: 'On air', max: 25, what: 'Hit the weather and traffic windows, and clear the underwriting credit by 9:30.' },
  { label: 'Freshness', max: 15, what: 'Air the current newscast, not the one written two hours ago.' },
  { label: 'Mix', max: 15, what: 'Local, network and music in proportion, and never three heavy stories back to back.' },
  { label: 'Hold', max: 15, what: 'Who was still listening at the worst minute of your hour.' },
] as const;
