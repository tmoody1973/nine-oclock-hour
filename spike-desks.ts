// SPIKE — throwaway evidence, not production code.
//
// Question: on OUR OWN wire, does a TypeSafe Choice file stories to a desk better than the
// hand-maintained regex list in lib/topics.ts? Nothing here touches the 5 a.m. cron, nothing
// becomes async, and lib/ is untouched. The deliverable is the disagreement list, not this file.
//
// The desk options are built from DESK_NAME so there is no second copy of the ten desks to
// drift out of step with the app.

import { DESK_ORDER } from './lib/desks';
import type { DayFile, Topic, WireItem } from './lib/types';
import { head } from '@vercel/blob';

const KEY = process.env.TYPESAFE_API_KEY;
const CONCURRENCY = 6;   // same politeness the cron uses for Gemini
const MODEL = 'jev-latest';

// What each desk MEANS, in the terms a producer would use. The rubric is where a Choice earns
// its keep: "news" versus "politics" is not obvious from the word alone.
const RUBRIC: Record<Topic, string> = {
  news: 'General breaking or national news that does not belong to a more specific desk. Newscasts and news briefs.',
  politics: 'Elections, campaigns, legislatures, courts, city hall, immigration enforcement, government itself.',
  world: 'Events outside the United States, foreign policy, war, international institutions.',
  economy: 'Business, markets, the Federal Reserve, inflation, jobs, wages, housing costs, taxes, trade.',
  health: 'Medicine, hospitals, public health, mental health, drugs, insurance and care.',
  tech: 'Technology, science, research, space, computing and artificial intelligence.',
  climate: 'Climate change, energy, weather as a climate story, environment and conservation.',
  culture: 'Arts, film, books, theatre, food, museums and cultural life that is not primarily music.',
  music: 'Musicians, albums, songs, concerts, the music industry and music itself.',
  // DELIBERATELY NOT AN OPTION in round two. "Which desk?" and "is this local?" are two
  // independent questions, and forcing them into one list of ten is what made `local` swallow
  // seven station stories at low confidence in round one: an SF Opera strike is music AND
  // local, and the model was right to be torn.
  local: 'Not offered as a desk in this round; asked separately as a yes/no.',
};

const SUBJECT_DESKS: Topic[] = DESK_ORDER.filter((t) => t !== 'local');

type Verdict = { desk: Topic; deskConfidence: number; localP: number };

async function fileOne(item: WireItem): Promise<Verdict | { error: string }> {
  const state = `HEADLINE: ${item.title}\nSUMMARY: ${item.teaser ?? ''}\nFILED BY: ${item.src}`;
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state,
      model: MODEL,
      // Both questions in ONE request: the endpoint takes a map, so this is still one call per
      // story rather than two.
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
            true: 'A local story: its subject, people or consequences are tied to that station\u2019s own city or region.',
            false: 'A national or international story that would run the same anywhere in the country.',
          },
        },
      },
    }),
  });
  if (!res.ok) return { error: `HTTP ${res.status} ${(await res.text()).slice(0, 120)}` };
  const body = await res.json();
  const d = body?.answers?.desk;
  const l = body?.answers?.isLocal;
  if (!d?.choice) return { error: `unexpected shape: ${JSON.stringify(body).slice(0, 200)}` };
  // A Noul returns the probability the answer is yes; the field name is read defensively
  // because this is the first call this project has made against it.
  const localP = typeof l?.value === 'number' ? l.value
    : typeof l?.probability === 'number' ? l.probability
    : typeof l?.noul === 'number' ? l.noul
    : NaN;
  return { desk: d.choice as Topic, deskConfidence: typeof d.confidence === 'number' ? d.confidence : NaN, localP };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function main() {
  if (!KEY) { console.error('TYPESAFE_API_KEY is not set. Add it to .env.local.'); process.exit(1); }
  const date = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const meta = await head(`days/${date}.json`);
  const day: DayFile = await fetch(meta.downloadUrl ?? meta.url, { cache: 'no-store' }).then((r) => r.json());
  const items = [...day.network, ...Object.values(day.stations).flatMap((s) => s.local)];
  console.log(`${date}: ${items.length} items, ${CONCURRENCY} at a time\n`);

  const answers = await pool(items, CONCURRENCY, fileOne);

  const pct = (n: number) => (Number.isNaN(n) ? '—' : `${Math.round(n * 100)}%`);
  let agree = 0, disagree = 0, failed = 0;
  const subject: string[] = [];
  const hadNoSubject: string[] = [];

  items.forEach((item, k) => {
    const a = answers[k];
    if ('error' in a) { failed++; subject.push(`  ERROR  ${item.title.slice(0, 60)} — ${a.error}`); return; }
    const where = item.how === 'satellite' ? 'CDS id' : 'regex';
    const line =
      `  ${item.title.slice(0, 66)}\n` +
      `     app: ${String(item.topic).padEnd(9)} jev: ${String(a.desk).padEnd(9)} ` +
      `conf ${pct(a.deskConfidence).padStart(4)}   local ${pct(a.localP).padStart(4)}   [${where}, ${item.src}]`;

    // The app filed it `local`, which in round one meant it never got a subject at all. There
    // is nothing to disagree WITH, so these are listed separately rather than counted as
    // misses: the interesting thing is the subject the app never assigned.
    if (item.topic === 'local') { hadNoSubject.push(line); return; }
    if (a.desk === item.topic) { agree++; return; }
    disagree++;
    subject.push(line);
  });

  console.log(`on the ${agree + disagree} stories the app gave a subject desk: agreed ${agree} · disagreed ${disagree}`);
  console.log(`plus ${hadNoSubject.length} the app filed only as "local", and ${failed} failures\n`);
  if (subject.length) { console.log('SUBJECT DESK DISAGREEMENTS:\n'); console.log(subject.join('\n\n')); }
  if (hadNoSubject.length) { console.log('\n\nFILED ONLY AS "LOCAL" — the subject the app never assigned:\n'); console.log(hadNoSubject.join('\n\n')); }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
