import type { Topic } from './types';
import type { ScoreWeights } from './hour';

const ALL: Topic[] = ['news', 'politics', 'world', 'economy', 'health', 'tech', 'culture', 'climate', 'local', 'music'];

// The generic listener loses 2 points to a heavy story. Yours loses nothing on the three
// subjects you chose, and twice as much on everything else. `score()` only reads this map on
// HEAVY_TOPICS (see hour.ts), so a pick outside that set — tech, culture, climate, local,
// music — is recorded here but never changes a score. That is the prototype's behaviour,
// ported as-is; see the note on Task 7's brief for why it's a decision, not a bug.
export function weightsFor(picks: Topic[]): ScoreWeights {
  return Object.fromEntries(ALL.map((t) => [t, picks.includes(t) ? 0 : 2]));
}
