// Filing a story to a desk, and deciding whether it is local, using TypeSafe's Jev.
//
// WHY THIS EXISTS, measured rather than assumed. On 2026-09-18's real wire, 17 of 54 stories —
// every one of them station copy — carried NO subject desk at all: lib/topics.ts's keyword list
// does not cover local vocabulary and never will ("Nobuya Brings Elegant Late-Night Sushi
// Boxes" matches nothing, and the culture pattern only knows `restaurant|chef`). Those 17 all
// filed as `local`, which silently weakened three things: a station music story could never
// satisfy the Mix score's music check, every item from the newsroom drew one colour, and — the
// worst of it — `local` is not in HEAVY_TOPICS, so a Legionnaires outbreak with a rising death
// toll cost the listener model nothing.
//
// TWO QUESTIONS, NOT ONE. Asking "which of these ten desks, including local" made the model
// torn on exactly the stories that are both: an SF Opera strike is music AND local, and it came
// back at 36% confidence saying so. Split apart, the same wire produced 7 subject disagreements
// instead of 17. Localness is a property of a story, not a subject it is about.

import { DESK_ORDER } from './desks';
import type { Topic, WireItem } from './types';

export const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
export const MODEL = 'jev-latest';

// Every desk except `local`, which is now a flag. See above.
export const SUBJECT_DESKS: Topic[] = DESK_ORDER.filter((t) => t !== 'local');

// Below this, the app keeps whatever lib/topics.ts decided. Taken from the spike rather than
// picked: on that run every disagreement at or above 0.75 was a real misfiling, and everything
// below it was a genuine toss-up between two defensible desks. A judgment the model is unsure
// of is worth less than the rule we already had.
export const MIN_CONFIDENCE = 0.75;

// What each desk MEANS to a public radio producer. The rubric is where a Choice earns its keep:
// "news" against "politics" is not decidable from the word alone.
const RUBRIC: Partial<Record<Topic, string>> = {
  news: 'General breaking or national news that belongs to no more specific desk. Newscasts and news briefs.',
  politics: 'Elections, campaigns, legislatures, courts, city hall, immigration enforcement, government itself.',
  world: 'Events outside the United States, foreign policy, war, international institutions.',
  economy: 'Business, markets, the Federal Reserve, inflation, jobs, wages, housing costs, taxes, trade.',
  health: 'Medicine, hospitals, public health, mental health, drugs, insurance and care.',
  tech: 'Technology, science, research, space, computing and artificial intelligence.',
  climate: 'Climate change, energy, weather as a climate story, environment and conservation.',
  culture: 'Arts, film, books, theatre, food, museums and cultural life that is not primarily music.',
  music: 'Musicians, albums, songs, concerts, the music industry and music itself.',
};

export type Judgment = { topic: Topic; confidence: number; localP: number };

// The state handed to the model. Headline, summary and who filed it — the same three things a
// producer glances at. Nothing about our hour, because the desk of a story does not depend on
// what else is in the rundown.
export const stateFor = (item: WireItem): string =>
  `HEADLINE: ${item.title}\nSUMMARY: ${item.teaser ?? ''}\nFILED BY: ${item.src}`;

type Fetcher = typeof fetch;

// `fetchFn` is injected so this is testable without a network or a key — the same seam
// lib/store.ts uses for Blob. Throws rather than returning a fallback: the caller decides what a
// failure means, and in the cron it means "keep the regex answer and say so in `degraded`".
export async function fileStory(item: WireItem, key: string, fetchFn: Fetcher = fetch): Promise<Judgment> {
  const res = await fetchFn(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: stateFor(item),
      model: MODEL,
      // Both questions in ONE request: the endpoint takes a map of questions, so filing a story
      // and judging its localness is one call, not two.
      questions: {
        desk: {
          type: 'choice',
          instructions: 'Which subject desk of a public radio newsroom files this story?',
          criteria: Object.fromEntries(SUBJECT_DESKS.map((t) => [t, RUBRIC[t]])),
        },
        isLocal: {
          type: 'noul',
          instructions: 'Is this story chiefly of interest to the community the filing station serves, rather than to a national audience?',
          criteria: {
            true: "A local story: its subject, people or consequences are tied to that station's own city or region.",
            false: 'A national or international story that would run the same anywhere in the country.',
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`typesafe ${res.status}`);
  const body = await res.json();
  const desk = body?.answers?.desk;
  if (!desk?.choice || !SUBJECT_DESKS.includes(desk.choice)) {
    throw new Error(`typesafe returned no usable desk: ${JSON.stringify(desk ?? body).slice(0, 120)}`);
  }
  const l = body?.answers?.isLocal;
  return {
    topic: desk.choice as Topic,
    confidence: typeof desk.confidence === 'number' ? desk.confidence : 0,
    // A Noul answers with the probability that the answer is yes. Read defensively across the
    // field names the shape could carry, and treated as "not local" when absent rather than
    // guessed — a missing answer must never invent a local flag.
    localP: typeof l?.value === 'number' ? l.value
      : typeof l?.probability === 'number' ? l.probability
      : typeof l?.noul === 'number' ? l.noul
      : 0,
  };
}

// Whether to prefer this judgment over what lib/topics.ts already decided.
export const trust = (j: Judgment): boolean => j.confidence >= MIN_CONFIDENCE;

// Local on the balance of probability. A flag, not a desk.
export const isLocal = (j: Judgment): boolean => j.localP >= 0.5;
