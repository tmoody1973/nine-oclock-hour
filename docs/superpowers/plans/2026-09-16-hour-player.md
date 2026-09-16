# Nine O'Clock Hour — player, daily wire, and personal meter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the prototype hour-builder into a hosted product where a listener builds a news hour from the day's real network and station feeds, presses play, and hears it on a commute.

**Architecture:** A Next.js app on Vercel. One server-side job each morning pulls the day's wire from NPR's Content Distribution Service and writes a single JSON file to Vercel Blob, so every player that day gets the same material. The browser reads that file, builds an hour against a pure rules engine, and plays the tape through one reused `<audio>` element with Media Session wired up for the lock screen. Nothing but metadata is ever stored: audio always streams from the publisher that made it.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · React 19 · pnpm 10.19.0 · Node 26.8.1 · `node --test` with `tsx` for pure-logic tests · Vercel (hosting, Cron, Blob).

**Spec:** No separate spec document. The requirements are: the working prototype at `https://claude.ai/code/artifact/1f862257-15ae-4c65-8f36-b0550381219a` (version 4, rules and scoring settled), the three product decisions in this repo's `docs/HANDOFF-2026-09-16.md` ("Press play and hear my hour", "the meter is you", "a reason to come back daily"), and NPR's CDS rights rules recorded below.

## Global Constraints

- **Store metadata, never audio.** Titles, runtimes, links, rights flags only. Audio streams from the publisher's own URL at play time. NPR premium audio is "play or link to it, never store or download it"; other stations' items are "display-only: attribute via url, refresh regularly, do not store beyond display".
- **The day file refreshes daily and is not an archive.** One file per date; delete files older than 7 days.
- **The CDS token never reaches the browser.** `NPR_CDS_TOKEN` is a server-only Vercel environment variable. Locally it lives at `~/.config/npr-cds/token` (mode 600) — read it, never print it, never commit it.
- **Every item on screen carries its source and a link back.** That is what "attribute via url" requires.
- **Reads are spoken, not skipped.** An item with no tape becomes a 30-second read. Tarik already pays for ElevenLabs, so that voice is the default and its credits are already bought; Gemini 2.5 Flash TTS is the fallback when credits run out (about 1.5¢ a minute against ElevenLabs' ~17¢, so a six-minute day costs roughly 9¢ on Gemini). The script is **our own summary with attribution** — never a publisher's copy read aloud, which display-only rights do not permit. Cache each read in Blob and regenerate only when the script changes.
- **Other stations' audio links out to their player in v1.** Only NPR network audio and 88Nine's own audio play inside our stream, until Tarik has asked the other stations.
- **Port the prototype's rules verbatim:** 59 minutes of programming plus a 1:00 legal ID; weather window 45s at 19:00; traffic window 45s at 49:00; underwriting credit 30s that must start before 30:00 (60s in pledge week, plus two 2:00 pitch breaks at 12:00 and 42:00); bulletin 75s at 34:00; a read is 30s.
- **Scoring weights, unchanged from the prototype:** Clock 30, On air 25, Freshness 15, Mix 15, Hold 15.
- **Run from the repo root.** Checks are `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`.
- **`server-only` is a real dependency and the test runner needs a flag to survive it.** Four modules below open with `import 'server-only'` — `lib/cds.ts`, `lib/day.ts`, `lib/store.ts`, `lib/reads.ts` — and each has a test that imports it directly. That package is a marker whose exports map resolves to an empty module under the `react-server` condition and **throws unconditionally otherwise**, so a plain `node --test` run crashes on it. Two things follow, both settled in Task 2 and true for every later task: it must be installed (`pnpm add server-only`), and the test script is `node --conditions=react-server --import tsx --test "lib/**/*.test.ts"`. Keep the guard — it is what turns "the CDS token never reaches the browser" into a build error rather than a convention — and do not delete the import to make a test pass.
- Commit messages end, after a blank line, with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01JipzCzK5wGnEtupZP1na2E`

## File structure

| File | Responsibility |
|---|---|
| `lib/types.ts` | `WireItem`, `DayFile`, `Block`, `Hour` — the only shared shapes |
| `lib/cds.ts` | Server-only CDS reads: network segments, newscast, one station's local file |
| `lib/day.ts` | Turns CDS results into a `DayFile`, including rights flags and "most carried" |
| `lib/hour.ts` | Pure rules engine: `layout()`, `score()`. No DOM, no fetch |
| `lib/taste.ts` | Topic weights from a listener's three picks; used by `score()` |
| `lib/reads.ts` | Writes a 30-second script in our own words, voices it with Gemini TTS, caches the mp3 |
| `app/api/cron/build-day/route.ts` | The 5 a.m. job: build the day file, write it to Blob |
| `app/page.tsx` | The hour builder: wire, rail, aircheck |
| `components/Player.tsx` | One `<audio>`, ping-pong preload, Media Session, read cards |
| `components/Aircheck.tsx` | Scores, the retention line, the end card |
| `lib/*.test.ts` | `node --test` suites beside each pure module |

---

### Task 1: Project skeleton that runs a test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/layout.tsx`, `app/page.tsx`, `lib/types.ts`, `lib/hello.test.ts`, `.gitignore`

**Interfaces:**
- Produces: `pnpm test`, `pnpm lint`, `pnpm build` scripts every later task uses; `WireItem` and `DayFile` types.

- [ ] **Step 1: Scaffold the app**

```bash
cd ~/Projects/newsroom-sim
pnpm create next-app@latest . --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*" --use-pnpm
```

- [ ] **Step 2: Add the test runner**

In `package.json` scripts, add:

```json
"test": "node --conditions=react-server --import tsx --test \"lib/**/*.test.ts\""
```

The `--conditions=react-server` flag is not optional and is not decoration: four later modules open with `import 'server-only'`, whose exports map throws under every other condition, and each has a test that imports it directly. Without the flag those suites crash. Then: `pnpm add -D tsx`

- [ ] **Step 3: Write the shared types** in `lib/types.ts`

```ts
export type How = 'satellite' | 'ours' | 'station' | 'podcast';
export type Topic = 'news' | 'politics' | 'world' | 'economy' | 'health' | 'tech' | 'culture' | 'climate' | 'local' | 'music';

export type WireItem = {
  id: string;
  src: string;            // "Morning Edition", "KCRW"
  how: How;
  kind: 'seg' | 'newscast';
  title: string;
  teaser: string;
  url: string;
  topic: Topic;
  when: string;           // "this morning", "yesterday"
  len: number;            // seconds of tape; 0 when there is none
  est?: number;           // estimated seconds when the feed carries no duration
  audio?: string;         // stream URL; absent when there is no tape
  expires?: string;       // ISO time, newscasts only
  old?: boolean;          // filed before today
};

export type DayFile = {
  date: string;           // YYYY-MM-DD
  builtAt: string;        // ISO
  network: WireItem[];
  stations: Record<string, { name: string; city: string; neighbour: string; local: WireItem[] }>;
  mostCarried: { title: string; url: string; stations: number };
};

// One thing scheduled in the hour. Wire items become blocks; so do the fixed pieces
// (legal ID, weather and traffic windows, pitch breaks, the credit, the bulletin).
export type Block = {
  id: string;
  label: string;
  len: number;             // seconds as scheduled
  how: How;
  kind: 'seg' | 'newscast';
  mode: 'tape' | 'read';
  topic: Topic;
  src?: string;
  audio?: string;
  realLen?: number;        // what untimed tape actually ran on air
  est?: boolean;           // the length was an estimate
  fixed?: boolean;         // the producer cannot remove it
  window?: boolean;        // weather or traffic
  credit?: boolean;        // the underwriting spot
  music?: boolean;
  bulletin?: boolean;
  expired?: boolean;       // a newscast past its time
  old?: boolean;           // filed before today
  long?: boolean;          // a full show inside the hour
};

export type Hour = Block[];
```

- [ ] **Step 4: Write the failing test** in `lib/hello.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { WireItem } from './types.ts';

test('a wire item with no tape is a read', () => {
  const item: WireItem = { id: 'x', src: 'WNYC', how: 'station', kind: 'seg', title: 't', teaser: '', url: 'https://example.org', topic: 'local', when: 'today', len: 0 };
  assert.equal(item.len, 0);
});
```

- [ ] **Step 5: Run it**

Run: `pnpm test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: next.js skeleton with a test runner and shared types"
```

---

### Task 2: Read CDS from the server

**Files:**
- Create: `lib/cds.ts`, `lib/cds.test.ts`, `lib/topics.ts`, `lib/topics.test.ts`, `lib/fixtures/me.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `cdsQuery(params: Record<string, string>): Promise<CdsDoc[]>`, `toWireItem(doc: CdsDoc, how: How, src: string): WireItem`, `classify(collectionIds: string[], text: string, how: How): Topic`, and the id table below.

**Known CDS ids** (confirmed live on 2026-09-16 through `npr-cds-mcp`): All Things Considered = collection `2`; Morning Edition = collection `3`; the NPR News Now hourly newscast = podcast channel `500005`; member-station local pieces carry collection `319418027` ("MPX Local Stories"). Station owner ids: 88Nine `s921`, KCRW `s55`, WBEZ `s308`, WNYC `s552`, WABE `s295`, KQED `s150`.

**Before writing the query**, read `~/projects/npr-cds-openapi/docs/REST_INTRO.md` and `openapi.yaml` for the exact query parameter names and the base URL. Do not guess them.

- [ ] **Step 1: Record one real response as a fixture**

```bash
cd ~/Projects/newsroom-sim
TOKEN=$(cat ~/.config/npr-cds/token) node -e '
const u = new URL("https://content.api.npr.org/v1/documents");
u.searchParams.set("collectionIds", "3");
u.searchParams.set("sort", "publishDateTime:desc");
u.searchParams.set("limit", "5");
fetch(u, { headers: { Authorization: "Bearer " + process.env.TOKEN } })
  .then((r) => r.json()).then((j) => require("node:fs").writeFileSync("lib/fixtures/me.json", JSON.stringify(j, null, 1)));
'
```

Expected: `lib/fixtures/me.json` exists and contains five Morning Edition documents. If the request 401s, the token is stale; stop and tell Tarik rather than working around it.

- [ ] **Step 2: Write the failing test** in `lib/cds.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toWireItem } from './cds.ts';

const doc = JSON.parse(readFileSync(new URL('./fixtures/me.json', import.meta.url), 'utf8')).resources[0];

test('a Morning Edition document becomes a satellite wire item with its runtime', () => {
  const item = toWireItem(doc, 'satellite', 'Morning Edition');
  assert.equal(item.how, 'satellite');
  assert.ok(item.title.length > 0);
  assert.ok(item.url.startsWith('https://'));
  assert.ok(item.len > 0, 'runtime comes from the audio asset duration');
  assert.ok(!item.teaser.includes('<'), 'html is stripped from the teaser');
  assert.notEqual(item.topic, 'news', 'the desk comes from the story\'s NPR topic collection, not the default');
});
```

- [ ] **Step 3: Run it**

Run: `pnpm test`
Expected: FAIL — `toWireItem` is not exported.

- [ ] **Step 3b: Write the desk classifier** in `lib/topics.ts`

**Verified on 2026-09-16 against live CDS, and this is why the naive version fails.** A CDS document's `collections` array carries **neither a `name` nor a plain `id`**: each entry is `{ href: "/v1/documents/1017", rels: [...] }`, and the topic id is the last path segment of that href. (An earlier draft of this plan said the entries were `{ id: "1014" }` — that was wrong, and came from a probe script that had already derived the id from the href before printing it. The `id ?? href.split('/').pop()` fallback in `toWireItem` below is therefore load-bearing, not defensive padding: the `id` branch never fires on live data.) Any classifier that reads `c.name` assigns nothing and every story falls into `news`, which would leave the Mix score (15 points) scoring noise and the taste meter (Task 7) with nothing to grip. Those numeric ids are NPR's own topic collections — the sections of the paper — and they were resolved by fetching each id:

| id | NPR topic | our desk | | id | NPR topic | our desk |
|---|---|---|---|---|---|---|
| 1014 | Politics | politics | | 1008 | Culture | culture |
| 1057 | Opinion | politics | | 1032 | Books | culture |
| 1059 | Analysis | politics | | 1045 | Movies | culture |
| 1070 | Law | politics | | 1046 | Performing Arts | culture |
| 1004 | World | world | | 1047 | Art & Design | culture |
| 1126 | Africa | world | | 1048 | Pop Culture | culture |
| 1017 | Economy | economy | | 1051 | Diversions | culture |
| 1006 | Business | economy | | 1053 | Food | culture |
| 1095 | Business Story of the Day | economy | | 1141 | Fine Art | culture |
| 1128 | Health | health | | 1020 | Media | culture |
| 1027 | Healthcare | health | | 1013 | Education | culture |
| 1019 | Technology | tech | | 1025 | Environment | climate |
| 1007 | Science | tech | | 1039 | Music | music |
| 1024 | Research News | tech | | 1103 | Studio Sessions | music |
| 1026 | Space | tech | | 1105 | Music Interviews | music |
| 1003 | National | news | | 1001 | News | news |

Ids `2` and `3` are programmes (All Things Considered, Morning Edition), `1002` is Home Page Top Stories, and `319418027` is MPX Local Stories — none of them is a desk, so they must not be in the table.

**Also verified:** a member station's local story carries **only** `319418027` and nothing else. Four WBEZ stories were checked and not one had a topic collection. So station copy has no topic metadata at all and the desk has to come from the words. That is what the keyword pass is for, and it is not a nicety — without it every station story is one undifferentiated blob.

**The desk is the subject, not the place.** A WBEZ story about the mayor's reelection belongs on the Politics desk; that it came from Chicago is already carried by `how` and `src`, which the UI shows anyway. `local` is the fall-back for a station story whose subject matches no desk — a neighbourhood festival, a station anniversary — and `news` is the fall-back for network copy in the same position.

```ts
import type { How, Topic } from './types';

// NPR's own topic collections are the sections of the paper. Confirmed live 2026-09-16.
const BY_ID: Record<string, Topic> = {
  1014: 'politics', 1057: 'politics', 1059: 'politics', 1070: 'politics',
  1004: 'world', 1126: 'world',
  1017: 'economy', 1006: 'economy', 1095: 'economy',
  1128: 'health', 1027: 'health',
  1019: 'tech', 1007: 'tech', 1024: 'tech', 1026: 'tech',
  1008: 'culture', 1032: 'culture', 1045: 'culture', 1046: 'culture', 1047: 'culture',
  1048: 'culture', 1051: 'culture', 1053: 'culture', 1141: 'culture', 1020: 'culture', 1013: 'culture',
  1025: 'climate',
  1039: 'music', 1103: 'music', 1105: 'music',
  1003: 'news', 1001: 'news',
};

// Station copy carries no topic collection, so the desk comes from the headline and the
// teaser. First match wins, so the most specific pattern goes first.
// Three regex details are load-bearing and were each verified against real headlines:
// `coal\b` carries a trailing boundary so it does not also claim "coalition";
// the leading \b with NO trailing \b is what lets `album` match "albums"; and the \b is
// attached to `music\b` alone so the bare word does not also swallow "musical".
const BY_WORD: [Topic, RegExp][] = [
  ['music',    /\b(album|band|musician|song|concert|jazz|hip.?hop|orchestra|record label|singer|music\b|vinyl|rapper|choir|symphony|record shop|setlist|headliner)/i],
  ['climate',  /\b(climate|emissions|drought|wildfire|flooding|heat wave|solar|coal\b|pipeline|carbon)/i],
  ['health',   /\b(hospital|patient|doctor|vaccine|medicaid|medicare|mental health|opioid|clinic|disease|birth control)/i],
  ['tech',     /\b(\bai\b|artificial intelligence|software|chip|startup|semiconductor|algorithm|data centre|data center|nasa|researchers)/i],
  // These two are proper nouns whose lower-case forms are ordinary English words, so they
  // deliberately OMIT the /i flag. That is the entire mechanism: it is what separates
  // "Fed holds rates steady" from "volunteers fed 300 people at the shelter". Do not add
  // /i to these two lines, and do not fold them into the case-insensitive lines below.
  ['economy',  /\bFed\b/],
  ['world',    /\bEU\b/],
  ['economy',  /\b(econom|inflation|tariff|unemploy|wages?|rent|housing market|budget|tax(es|payer)?|layoff|federal reserve|interest rate)/i],
  ['politics', /\b(mayor|alderman|city council|governor|senat|congress|legislat|election|campaign|reelection|ballot|impeach|court|lawsuit|immigration|ice\b)/i],
  ['world',    /\b(ukraine|gaza|israel|china|russia|nato|migrants?|border|foreign minister|united nations)/i],
  ['culture',  /\b(museum|festival|artist|theatre|theater|film|novel|exhibit|restaurant|chef|arts spending|mural)/i],
];

export function classify(collectionIds: string[], text: string, how: How): Topic {
  for (const id of collectionIds) { const desk = BY_ID[id]; if (desk) return desk; }
  for (const [desk, re] of BY_WORD) if (re.test(text)) return desk;
  return how === 'ours' || how === 'station' ? 'local' : 'news';
}
```

Write `lib/topics.test.ts` alongside it, and run `pnpm test` after:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './topics.ts';

test('an NPR topic collection id sets the desk', () => {
  assert.equal(classify(['1014', '3'], 'Rep. Massie moves to impeach', 'satellite'), 'politics');
  assert.equal(classify(['1017', '3'], 'The Fed is expected to raise rates', 'satellite'), 'economy');
  assert.equal(classify(['1019', '3'], "'Machine Gods' explores AI", 'satellite'), 'tech');
});

test('a programme id is not a desk', () => {
  assert.notEqual(classify(['3'], 'Morning Edition for September 16', 'satellite'), 'news' as never === true ? 'x' : classify(['1014'], 'x', 'satellite'));
  assert.equal(classify(['3'], 'Morning Edition for September 16', 'satellite'), 'news');
  assert.equal(classify(['319418027'], 'A station anniversary', 'ours'), 'local');
});

test('station copy with no topic collection is classified from its words', () => {
  assert.equal(classify(['319418027'], 'Chicago Mayor Brandon Johnson launches reelection campaign', 'ours'), 'politics');
  assert.equal(classify(['319418027'], "How does Chicago's arts spending stack up with other major cities", 'ours'), 'culture');
});

test('a station story about nothing on the list falls back to local', () => {
  assert.equal(classify(['319418027'], 'El Grito returns to the neighbourhood', 'ours'), 'local');
});
```

Expected after implementing: PASS.

- [ ] **Step 4: Implement `lib/cds.ts`**

```ts
import 'server-only';
import type { How, WireItem } from './types';
import { classify } from './topics';

const CDS = 'https://content.api.npr.org/v1/documents';
const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export type CdsDoc = Record<string, any>;

export async function cdsQuery(params: Record<string, string>): Promise<CdsDoc[]> {
  const token = process.env.NPR_CDS_TOKEN;
  if (!token) throw new Error('NPR_CDS_TOKEN is not set');
  const url = new URL(CDS);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!res.ok) throw new Error(`CDS ${res.status} for ${url.pathname}?${url.searchParams}`);
  return (await res.json()).resources ?? [];
}

// CDS keeps audio in an assets map the document points at by fragment href.
const primaryAudio = (doc: CdsDoc) => {
  const href: string | undefined = doc.audio?.[0]?.href;
  const asset = href?.startsWith('#/assets/') ? doc.assets?.[href.slice(9)] : undefined;
  const mp3 = asset?.enclosures?.find((e: any) => e.type === 'audio/mpeg');
  return { seconds: asset?.duration ?? 0, href: mp3?.href as string | undefined };
};

export function toWireItem(doc: CdsDoc, how: How, src: string): WireItem {
  const audio = primaryAudio(doc);
  // collections arrive as { href, rels } — no name, no plain id. The id is the last
  // path segment of the href; the `id ??` branch is a belt-and-braces fallback. See Step 3b.
  const ids: string[] = (doc.collections ?? []).map((c: any) => c.id ?? String(c.href ?? '').split('/').pop()).filter(Boolean);
  const topic = classify(ids, `${doc.title ?? ''} ${strip(doc.teaser ?? '')}`, how);
  const day = String(doc.publishDateTime ?? '').slice(0, 10);
  return {
    id: doc.id,
    src, how,
    kind: 'seg',
    title: strip(doc.title ?? ''),
    teaser: strip(doc.teaser ?? '').slice(0, 320),
    url: doc.webPages?.[0]?.href ?? doc.nprWebsitePath ?? '',
    topic,
    when: day,
    len: audio.seconds,
    audio: audio.href,
    old: day !== new Date().toISOString().slice(0, 10),
  };
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 6: Write `.env.example`**

```
# Server-only. Local value lives in ~/.config/npr-cds/token — never commit the real one.
NPR_CDS_TOKEN=
# Issued by Vercel when you add Blob storage to the project.
BLOB_READ_WRITE_TOKEN=
# Any long random string; the cron route rejects requests without it.
CRON_SECRET=
```

- [ ] **Step 7: Commit**

```bash
git add lib/cds.ts lib/cds.test.ts lib/topics.ts lib/topics.test.ts lib/fixtures/me.json .env.example
git commit -m "feat: server-side CDS reads and a desk classifier over NPR topic ids"
```

---

### Task 3: Build the day file

**Files:**
- Create: `lib/day.ts`, `lib/day.test.ts`

**Interfaces:**
- Consumes: `cdsQuery`, `toWireItem` from Task 2.
- Produces: `buildDay(now: Date): Promise<DayFile>` and `mostCarried(items: WireItem[]): DayFile['mostCarried']`.

**Every item in the day file must be linkable.** `toWireItem` falls back to `url: ''` when a
document carries neither `webPages[0].href` nor `nprWebsitePath`. That is fine as a parsing
default but not as something to publish: the plan's own constraint is that every item on
screen carries its source and a link back, because NPR's display-only terms are "attribute
via url". So `buildDay` filters unlinkable items out before they reach the day file — see
`airable` below. This was caught in Task 2's review as a plan defect rather than an
implementer defect; the fix belongs here, in the task that assembles what gets published,
not in the parser.

**The six newsrooms**, each with the neighbour whose tape may not be rolled: 88Nine `s921` (Milwaukee, neighbour `s55`), KCRW `s55` (Los Angeles, `s552`), WBEZ `s308` (Chicago, `s295`), WNYC `s552` (New York, `s308`), WABE `s295` (Atlanta, `s150`), KQED `s150` (the Bay Area, `s921`).

- [ ] **Step 1: Write the failing test** in `lib/day.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mostCarried } from './day.ts';
import type { WireItem } from './types.ts';

const item = (id: string, src: string, title: string): WireItem =>
  ({ id, src, how: 'station', kind: 'seg', title, teaser: '', url: 'https://example.org/' + id, topic: 'news', when: '2026-09-16', len: 60 });

test('the most carried story is the title the most newsrooms filed on', () => {
  const out = mostCarried([
    item('a', 'WNYC', 'The Fed raises interest rates'),
    item('b', 'WBEZ', 'The Fed raises interest rates again'),
    item('c', 'KQED', 'A strike at the opera'),
  ]);
  assert.equal(out.stations, 2);
  assert.match(out.title, /Fed/);
});

test('two headlines sharing only a common news phrase are NOT the same story', () => {
  // The exact false pairing a real day produced under the old two-word bar.
  const out = mostCarried([
    item('a', 'WBEZ', 'Washington Park mass shooting rattles community'),
    item('b', 'WABE', 'Federal case against man accused of plotting mass shooting'),
  ]);
  assert.equal(out.stations, 0, 'no answer is the correct answer here');
  assert.equal(out.title, '', 'and it must not offer a title it cannot stand behind');
});

test('generic connectives are not evidence of a shared story', () => {
  // The real false pair a live wire produced once the bar was already at three words.
  // **Use these headlines verbatim.** An earlier draft of this test shortened the second
  // one to "...leaving their country", which drops the trailing "over" and leaves only two
  // shared words — below the bar, so the test passed whether or not the STOP list was
  // fixed. A test built from a paraphrased headline proves nothing. Under the short STOP
  // list these two share exactly "have", "their", "over"; under the corrected one, nothing.
  const out = mostCarried([
    item('a', 'KQED', 'Over Half a Million Californians Have Signed Up to Delete Their Info From Data Brokers. Here\u2019s How You Can, Too'),
    item('b', 'All Things Considered', 'A record number of Israelis have been leaving their country over the last 3 years'),
  ]);
  assert.equal(out.stations, 0, '"have", "their" and "over" are not a shared subject');
});

test('two newsrooms on one story, sharing its proper nouns, IS a real match', () => {
  // Silence is only correct if the thing can still see a genuine match.
  const out = mostCarried([
    item('a', 'WBEZ', 'Chicago Mayor Brandon Johnson launches reelection campaign'),
    item('b', 'WNYC', 'Mayor Brandon Johnson kicks off reelection bid in Chicago'),
  ]);
  assert.equal(out.stations, 2);
});

test('a lone story does not count itself as a newsroom', () => {
  const out = mostCarried([item('a', 'WBEZ', 'Washington Park mass shooting rattles community')]);
  assert.equal(out.stations, 0, 'one newsroom is not "most carried"');
});

test('an empty wire returns no answer rather than throwing', () => {
  assert.deepEqual(mostCarried([]), { title: '', url: '', stations: 0 });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `mostCarried` is not exported.

- [ ] **Step 3: Implement `lib/day.ts`**

```ts
import 'server-only';
import { cdsQuery, toWireItem } from './cds';
import type { DayFile, WireItem } from './types';

export const STATIONS = {
  s921: { name: '88Nine Radio Milwaukee', city: 'Milwaukee', neighbour: 's55' },
  s55:  { name: 'KCRW', city: 'Los Angeles', neighbour: 's552' },
  s308: { name: 'WBEZ', city: 'Chicago', neighbour: 's295' },
  s552: { name: 'WNYC', city: 'New York', neighbour: 's308' },
  s295: { name: 'WABE', city: 'Atlanta', neighbour: 's150' },
  s150: { name: 'KQED', city: 'the Bay Area', neighbour: 's921' },
} as const;

// **WBEZ files no web link on any story.** Verified against live CDS on 2026-09-16 by
// walking every string in a WBEZ document: there is no `webPages`, no `nprWebsitePath`,
// no canonical page anywhere — only CDS internal paths and the audio enclosure. WNYC omits
// it occasionally too. Dropping those items would empty Chicago out of a six-newsroom
// product, so instead we attribute at station level: the item links to the newsroom that
// filed it. That is weaker than a story link and it is a deliberate trade — see the
// decision record in Task 8. These six resolved on 2026-09-16 (KCRW answered 429 and WABE
// 403 to a bare curl, which is anti-bot behaviour, not a bad domain).
// Network documents need this as much as station copy does. Verified live on 2026-09-16:
// an NPR News Now newscast document carries NO webPages and NO nprWebsitePath — only the
// org-API href and image assets — so `airable` dropped every newscast, and the newscast is
// core furniture in the hour, not incidental content. Keyed by `src`. All three returned
// 200 on 2026-09-16.
const NETWORK_SITE: Record<string, string> = {
  'NPR': 'https://www.npr.org/podcasts/500005/npr-news-now',
  'Morning Edition': 'https://www.npr.org/programs/morning-edition',
  'All Things Considered': 'https://www.npr.org/programs/all-things-considered',
};

const SITE: Record<string, string> = {
  s921: 'https://radiomilwaukee.org',
  s55:  'https://www.kcrw.com',
  s308: 'https://www.wbez.org',
  s552: 'https://www.wnyc.org',
  s295: 'https://www.wabe.org',
  s150: 'https://www.kqed.org',
};

// The short version of this list WAS the bug. Words like "have", "their", "over", "this"
// and "said" survive the length>3 filter and carry no subject, so two unrelated headlines
// sharing three of them looked like two newsrooms on one story. Measured on a real wire:
// with the short list, KQED's data-broker story paired with an All Things Considered story
// about Israeli emigration on "have"/"their"/"over".
const STOP = new Set([
  'the','a','an','of','in','on','to','for','and','at','is','are','as','its','after','with','from',
  'have','has','had','been','being','their','them','they','this','that','these','those',
  'than','then','over','under','out','into','about','more','most','some','many','much',
  'new','how','why','what','who','when','where','will','would','could','should',
  'says','said','say','make','made','take','takes','back','down','just','also','still',
  'before','during','while','year','years','week','weeks','day','days',
  'first','last','next','other','another','because','through','against','between','among',
]);
const keywords = (title: string) => title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w));

// Two newsrooms are on the same story when their headlines share THREE significant words.
//
// It was two, and two is wrong. Measured against a real day's wire (52 headlines, 16
// September 2026) the two-word bar paired WBEZ's "Washington Park mass shooting rattles
// community..." with WABE's "Federal case against man accused of plotting mass shooting
// at..." — a Chicago neighbourhood shooting and an Atlanta federal case, joined by the
// words "mass" and "shooting". Raising the bar to three produced no match at all that day,
// which is the right answer: on most days no two of these six newsrooms genuinely are on
// the same story, and the honest output is silence.
//
// ponytail: word overlap is a weak signal and this is its measured ceiling. What it DOES
// catch is two newsrooms using the same proper nouns for one event — "Chicago Mayor Brandon
// Johnson launches reelection campaign" against "Mayor Brandon Johnson kicks off reelection
// bid in Chicago" shares five, and "SF Opera cancels performances as musicians strike"
// against "San Francisco Opera cancels more shows amid musicians strike" shares four. What
// it CANNOT catch is the same story told in different words: "Fed holds interest rates
// steady" against "Federal Reserve leaves borrowing costs unchanged" shares nothing at all.
// So the feature is precise and partly deaf, which is the right way round for a line that
// makes a confident claim. Rarity weighting does not help (the offending words appeared in
// only 2 of 52 headlines, so they were already "rare"). The upgrade, when the feature earns
// it, is sentence embeddings rather than a cleverer word rule. Until then the contract is:
// **callers must check `stations >= 2` before showing anything.** `stations: 0` means no
// answer, not a weak answer.
export function mostCarried(items: WireItem[]): DayFile['mostCarried'] {
  let best = { title: '', url: '', stations: 0 };
  for (const item of items) {
    const words = new Set(keywords(item.title));
    const stations = new Set(
      items.filter((other) => keywords(other.title).filter((w) => words.has(w)).length >= 3).map((o) => o.src),
    );
    // An item always matches itself, so a lone story scores 1, never 0. Only a genuine
    // cross-newsroom match is ever recorded — which is what makes `stations: 0` mean
    // "no answer" rather than "a weak answer", without every caller having to remember it.
    if (stations.size >= 2 && stations.size > best.stations) {
      best = { title: item.title, url: item.url, stations: stations.size };
    }
  }
  return best;
}

// NPR's display-only terms are "attribute via url". An item we cannot link back to
// cannot lawfully go on screen, so it never enters the day file. Dropping one story is
// harmless; showing an unattributed one is a rights problem. Station items have already
// been given their newsroom's own site as a fallback by this point, so anything reaching
// here with no url is network copy that arrived genuinely unattributable. The warning matters because
// this runs in a cron with nobody watching: a feed that changes shape should be visible
// in the logs rather than silently thinning the wire.
function airable(items: WireItem[]): WireItem[] {
  return items.filter((i) => {
    if (i.url) return true;
    console.warn(`dropped ${i.id} from ${i.src}: no url to attribute it to`);
    return false;
  });
}

// This runs at 5 a.m. with nobody watching, and `cdsQuery` throws on any non-200. Without
// isolation, one flaky feed takes down the whole day: no day file, so every listener who
// opens the app that morning gets nothing. Verified against the live wire that parsing
// itself is resilient — `toWireItem` survives a completely empty document, a missing audio
// asset, and a collections entry with neither id nor href, seven malformed shapes in all,
// without throwing. The fragility was never in the parsing; it was in the orchestration.
// So each query is isolated: a failed arm contributes nothing, says so in the logs, and
// the rest of the wire still ships.
async function safe<T>(label: string, run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (e) {
    console.error(`day build: ${label} failed, continuing without it \u2014 ${(e as Error).message}`);
    return [];
  }
}

export async function buildDay(now = new Date()): Promise<DayFile> {
  const date = now.toISOString().slice(0, 10);
  const q = (params: Record<string, string>) => cdsQuery({ sort: 'publishDateTime:desc', ...params });

  const [me, atc, casts] = await Promise.all([
    safe('Morning Edition', () => q({ collectionIds: '3', limit: '8' })),
    safe('All Things Considered', () => q({ collectionIds: '2', limit: '8' })),
    safe('NPR News Now', () => q({ collectionIds: '500005', limit: '2' })),
  ]);

  const network: WireItem[] = airable([
    ...casts.map((d, i) => ({ ...toWireItem(d, 'satellite', 'NPR'), kind: 'newscast' as const,
      expires: d.recommendUntilDateTime ?? d.expirationDateTime, old: i > 0 })),
    ...me.map((d) => toWireItem(d, 'satellite', 'Morning Edition')),
    ...atc.map((d) => toWireItem(d, 'satellite', 'All Things Considered')),
  ].map((i) => (i.url ? i : { ...i, url: NETWORK_SITE[i.src] ?? '' })));

  const stations: DayFile['stations'] = {} as DayFile['stations'];
  for (const [id, s] of Object.entries(STATIONS)) {
    const docs = await safe(s.name, () => q({ collectionIds: '319418027', ownerHrefs: `https://organization.api.npr.org/v4/services/${id}`, limit: '6' }));
    stations[id] = { ...s, local: airable(docs.map((d) => {
      const item = toWireItem(d, 'ours', s.name);
      return item.url ? item : { ...item, url: SITE[id] };   // new object, never mutated
    })) };
  }

  const locals = Object.values(stations).flatMap((s) => s.local);
  return { date, builtAt: now.toISOString(), network, stations, mostCarried: mostCarried(locals.concat(network)) };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Prove it against live CDS once** — note the `--conditions=react-server` flag: `lib/day.ts` opens with `import 'server-only'`, whose exports map throws under any other condition, so a bare `pnpm exec tsx -e` fails here exactly as it does for the test runner. Do not remove the guard to make the command run.

```bash
NPR_CDS_TOKEN=$(cat ~/.config/npr-cds/token) node --conditions=react-server --import tsx -e "import('./lib/day.ts').then(async m => { const d = await m.buildDay(); console.log(d.date, d.network.length, Object.keys(d.stations).length, d.mostCarried.stations); })"
```
Expected: today's date, at least 10 network items, 6 stations, and a most-carried count of 2 or more. If a station returns nothing, note it in the report — some newsrooms file rarely — but do not hard-code substitutes. Also confirm that **a failing feed does not take the day down**: temporarily point one station's `ownerHrefs` at a nonsense service id so CDS rejects it, re-run, and check that the run still completes with the other five stations intact and a `day build: <station> failed, continuing without it` line in the output. Restore it afterwards and say you did. Then report **how many items `airable` dropped for having no url**, and from which sources: its `console.warn` lines appear in this run's output. Zero is the expected answer and a healthy one; a non-zero count is worth naming, because it means part of the wire is arriving unlinkable.

- [ ] **Step 6: Commit**

```bash
git add lib/day.ts lib/day.test.ts && git commit -m "feat: build the day file from six newsrooms and the network"
```

---

### Task 4: The cron route and Blob storage

**Files:**
- Create: `app/api/cron/build-day/route.ts`, `lib/store.ts`, `vercel.json`

**Interfaces:**
- Consumes: `buildDay` from Task 3.
- Produces: `putDay(day: DayFile): Promise<string>`, `getDay(date: string): Promise<DayFile | null>`.

**Two traps this task will hit, both already paid for twice.** Task briefs are extracted
per task, so the plan's Global Constraints do not travel with them — they are repeated here
deliberately.

1. **`lib/store.ts` opens with `import 'server-only'`, and that package throws under any
   condition except `react-server`.** The `test` script already carries
   `--conditions=react-server`; any *ad hoc* command that imports this module needs it too.
   A bare `pnpm exec tsx -e "import('./lib/store.ts')..."` will fail, and the failure looks
   like a bug in the module. It is not. Use
   `node --conditions=react-server --import tsx -e "..."`. **Do not delete the guard to make
   a command run** — it is what keeps the CDS token out of the browser bundle, and this repo
   is public. Tasks 2 and 3 each lost a round to this.
2. **Port 3000 on this machine belongs to an unrelated server.** Never start anything on it,
   never stop it, never test against it. Use 3020 or 3030, as the commands below do.

- [ ] **Step 1: Add the Blob client**

```bash
pnpm add @vercel/blob
```

- [ ] **Step 2: Write `lib/store.ts`**

```ts
import 'server-only';
import { head, list, put, del } from '@vercel/blob';
import type { DayFile } from './types';

const key = (date: string) => `days/${date}.json`;

export async function putDay(day: DayFile): Promise<string> {
  const { url } = await put(key(day.date), JSON.stringify(day), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
  // The day file is not an archive: a week is enough to compare yesterday with today.
  const old = await list({ prefix: 'days/' });
  const cutoff = Date.now() - 7 * 864e5;
  await Promise.all(old.blobs.filter((b) => b.uploadedAt.getTime() < cutoff).map((b) => del(b.url)));
  return url;
}

export async function getDay(date: string): Promise<DayFile | null> {
  try {
    const meta = await head(key(date));
    return await fetch(meta.url, { cache: 'no-store' }).then((r) => r.json());
  } catch { return null; }
}
```

- [ ] **Step 3: Write the route** `app/api/cron/build-day/route.ts`

```ts
import { buildDay } from '@/lib/day';
import { putDay } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = req.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) return new Response('no', { status: 401 });
  const day = await buildDay();
  const url = await putDay(day);
  return Response.json({ date: day.date, network: day.network.length, url });
}
```

- [ ] **Step 4: Schedule it** in `vercel.json`

```json
{ "crons": [{ "path": "/api/cron/build-day", "schedule": "0 10 * * *" }] }
```

10:00 UTC is 5 a.m. Central, before anyone opens the app. Vercel sends the cron secret as the Authorization header when `CRON_SECRET` is set.

- [ ] **Step 5: Test it locally**

```bash
NPR_CDS_TOKEN=$(cat ~/.config/npr-cds/token) CRON_SECRET=local pnpm dev --port 3020 &
curl -s -H "Authorization: Bearer local" http://127.0.0.1:3020/api/cron/build-day | head -c 300
```
Expected: JSON with today's date and a network count. Blob writes need `BLOB_READ_WRITE_TOKEN`; without it the route throws, which is the correct failure — report it rather than falling back to the filesystem.

- [ ] **Step 6: Commit**

```bash
git add lib/store.ts app/api/cron vercel.json package.json pnpm-lock.yaml
git commit -m "feat: a five a.m. job that writes the day file to blob storage"
```

---

### Task 5: The rules engine, ported

**Files:**
- Create: `lib/hour.ts`, `lib/hour.test.ts`

**Interfaces:**
- Produces: `layout(blocks: Block[], pledge: boolean)`, `score(hour: Block[], opts)`. Both pure: no DOM, no fetch, no `Math.random` (untimed drift is passed in).

- [ ] **Step 1: Write the failing tests** in `lib/hour.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, score } from './hour.ts';
import type { Block } from './types.ts';

const seg = (id: string, len: number, extra: Partial<Block> = {}): Block =>
  ({ id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra });

test('the weather window lands at 19:00 when the hour is shorter than that', () => {
  const { rows } = layout([seg('a', 600)], false);
  const wx = rows.find((r) => r.b.id === 'wx');
  assert.equal(wx?.at, 19 * 60);
});

test('a segment still running at 19:00 crashes the window and says by how much', () => {
  const { crashes } = layout([seg('a', 19 * 60 + 30)], false);
  assert.equal(crashes[0].over, 30);
});

test('pledge week adds two pitch breaks', () => {
  const plain = layout([seg('a', 60)], false).end;
  const pledged = layout([seg('a', 60)], true).end;
  assert.equal(pledged - plain, 240);
});

test('an hour that lands inside five seconds scores full marks on the clock', () => {
  const blocks = [seg('id', 60, { fixed: true }), seg('a', 3540 - 90 - 60)];
  const out = score(blocks, { pledge: false, flash: 'now', drift: 0, weights: {} });
  assert.equal(out.scores.Clock, 30);
});
```

- [ ] **Step 2: Run them**

Run: `pnpm test`
Expected: FAIL — `./hour.ts` does not exist.

- [ ] **Step 3: Port the engine** from the prototype into `lib/hour.ts`

Copy `layout()` and the scoring body from the published prototype (version 4 of the artifact; the source is `/private/tmp/claude-502/-Users-tarikmoody-Projects-hyfin-grove/2c8ef1f8-3e15-494f-af26-0da4996f3beb/scratchpad/newsroom-sim/index.html`), with three changes:

1. Export `layout(blocks, pledge)` and `score(hour, { pledge, flash, drift, weights })` instead of reading module-level state.
2. Replace the `Math.random()` untimed-tape drift with the `drift` argument, so tests are deterministic. The UI passes `Math.round((Math.random() * 2 - 1) * 40)`.
3. Return `{ scores, notes, curve, low }` rather than writing to the DOM.

Keep every constant and every note's wording exactly as the prototype has them.

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS, all four.

- [ ] **Step 5: Commit**

```bash
git add lib/hour.ts lib/hour.test.ts && git commit -m "feat: pure rules engine ported from the prototype"
```

---

### Task 6: The player

**Files:**
- Create: `components/Player.tsx`, `lib/playlist.ts`, `lib/playlist.test.ts`

**Interfaces:**
- Consumes: `Block[]` from the hour.
- Produces: `toPlaylist(hour: Block[]): PlayItem[]` where `PlayItem = { id, title, src, audio?, seconds }`; `<Player hour={...} station={...} />`.

- [ ] **Step 1: Write the failing test** in `lib/playlist.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlaylist } from './playlist.ts';

test('items without tape stay in the playlist as cards, not as audio', () => {
  const list = toPlaylist([
    { id: 'a', label: 'With tape', len: 120, audio: 'https://example.org/a.mp3', how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news' },
    { id: 'b', label: 'A read', len: 30, how: 'ours', kind: 'seg', mode: 'read', topic: 'local' },
  ] as any);
  assert.equal(list.length, 2);
  assert.equal(list[1].audio, undefined);
  assert.equal(list[1].seconds, 30);
});

test("another station's tape is a card, never a stream", () => {
  const list = toPlaylist([{ id: 'c', label: 'Theirs', len: 200, audio: 'https://kcrw.example/x.mp3', how: 'station', kind: 'seg', mode: 'read', topic: 'local' }] as any);
  assert.equal(list[0].audio, undefined);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `./playlist.ts` does not exist.

- [ ] **Step 3: Implement `lib/playlist.ts`**

```ts
import type { Block } from './types';

export type PlayItem = { id: string; title: string; src: string; audio?: string; seconds: number };

// v1 streams only network and our own audio. Another station's tape links out until they say yes.
export const toPlaylist = (hour: Block[]): PlayItem[] =>
  hour.map((b) => ({
    id: b.id,
    title: b.label,
    src: b.src ?? '',
    seconds: b.realLen ?? b.len,
    audio: b.mode === 'tape' && (b.how === 'satellite' || b.how === 'ours') ? b.audio : undefined,
  }));
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Write `components/Player.tsx`**

The three things that make or break this on a phone: one audio element for the whole session, advancing by swapping `src`, and Media Session metadata so the lock screen works.

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import type { PlayItem } from '@/lib/playlist';

export function Player({ list, station }: { list: PlayItem[]; station: string }) {
  // One element for the session. iOS unlocks audio on the element the user tapped;
  // creating a new one per track loses that unlock and playback silently stops.
  const el = useRef<HTMLAudioElement>(null);
  const next = useRef<HTMLAudioElement>(null);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const item = list[i];

  useEffect(() => {
    const a = el.current;
    if (!a || !item) return;
    if (item.audio) { a.src = item.audio; if (playing) void a.play().catch(() => setPlaying(false)); }
    else if (playing) { const t = setTimeout(() => setI((n) => n + 1), item.seconds * 1000); return () => clearTimeout(t); }
    if (next.current && list[i + 1]?.audio) next.current.src = list[i + 1].audio!;  // warm the next file
  }, [i, playing, item, list]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.src, album: `${station} · the nine o'clock hour` });
    navigator.mediaSession.setActionHandler('nexttrack', () => setI((n) => Math.min(n + 1, list.length - 1)));
    navigator.mediaSession.setActionHandler('previoustrack', () => setI((n) => Math.max(n - 1, 0)));
  }, [item, list.length, station]);

  if (!item) return null;
  return (
    <section aria-label="Player">
      <audio ref={el} onEnded={() => setI((n) => n + 1)} preload="none" />
      <audio ref={next} preload="metadata" style={{ display: 'none' }} />
      <button onClick={() => { setPlaying((p) => !p); const a = el.current; if (!a) return; playing ? a.pause() : void a.play().catch(() => setPlaying(false)); }}>
        {playing ? 'Pause' : 'Play my hour'}
      </button>
      <p>{item.title} — {item.src}{item.audio ? '' : ' (read)'}</p>
      <p>{i + 1} of {list.length}</p>
    </section>
  );
}
```

- [ ] **Step 6: Try it on a phone**

Run `pnpm dev --port 3020` — **not bare `pnpm dev`, which binds port 3000, and port 3000 on this machine belongs to an unrelated server that must never be started, stopped or tested against.** Then open `http://<your-Mac's-LAN-IP>:3020` on an iPhone on the same network (the phone cannot reach `localhost`), build an hour, press **Play my hour**, then lock the screen.
Expected: audio keeps playing with the screen off, and the lock screen shows the title and station. If it stops on lock, the cause is almost always a second audio element being created — check that only the two refs above exist.

- [ ] **Step 7: Commit**

```bash
git add components/Player.tsx lib/playlist.ts lib/playlist.test.ts
git commit -m "feat: play the hour through one audio element with lock-screen controls"
```

---

### Task 7: The meter is the listener

**Files:**
- Create: `lib/taste.ts`, `lib/taste.test.ts`, `components/Aircheck.tsx`
- Modify: `lib/hour.ts` (accept `weights`)

**Interfaces:**
- Produces: `weightsFor(picks: Topic[]): Partial<Record<Topic, number>>`, used by `score()`.

- [ ] **Step 1: Write the failing test** in `lib/taste.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weightsFor } from './taste.ts';

test('a topic you picked costs nothing; one you did not costs double', () => {
  const w = weightsFor(['music', 'local', 'world']);
  assert.equal(w.music, 0);
  assert.equal(w.world, 0);
  assert.equal(w.politics, 2);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `./taste.ts` does not exist.

- [ ] **Step 3: Implement `lib/taste.ts`**

```ts
import type { Topic } from './types';

// The generic listener loses 2 points to a heavy story. Yours loses nothing on the three
// subjects you chose, and twice as much on everything else.
export function weightsFor(picks: Topic[]): Partial<Record<Topic, number>> {
  const all: Topic[] = ['news','politics','world','economy','health','tech','culture','climate','local','music'];
  return Object.fromEntries(all.map((t) => [t, picks.includes(t) ? 0 : 2]));
}
```

- [ ] **Step 4: Use the weights in `score()`**

In `lib/hour.ts`, where the retention walk subtracts for a heavy topic, replace the fixed `2` with `weights[b.topic] ?? 2`.

- [ ] **Step 5: Run the tests**

Run: `pnpm test`
Expected: PASS, including Task 5's four.

- [ ] **Step 6: Build the end card** in `components/Aircheck.tsx`

Show the five scores, the retention line, the notes, and underneath: **"What the network actually did"** — the same morning's Morning Edition rundown in order with runtimes, read from `day.network` filtered to `src === 'Morning Edition'`, so a player can see where the professionals put the light story. Add one line naming `day.mostCarried.title` when it is not in the player's hour: *"Every other newsroom carried this. You didn't."* — **but only when `day.mostCarried.stations >= 2`.** `stations: 0` means the heuristic found no genuine match and the line must not render at all; see the note above `mostCarried` in Task 3 for why. On a real day's wire this line will often be absent, and that is correct: a confident sentence built on a weak match tells the listener something false.

- [ ] **Step 7: Commit**

```bash
git add lib/taste.ts lib/taste.test.ts components/Aircheck.tsx lib/hour.ts
git commit -m "feat: the retention meter follows the listener's own three subjects"
```

---

### Task 8: Ship it

**Files:**
- Create: `README.md`, `docs/decisions/001-stream-never-store.md`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Wire the page** — `app/page.tsx` reads today's file with `getDay(new Date().toISOString().slice(0,10))`, falls back to the most recent day in Blob when the cron has not run, and renders the station picker, wire, rail, player and aircheck. The wire is a flat list at this point; Task 10 replaces it with the desk view, so do not build section grouping here.

- [ ] **Step 2: Local check**

Run: `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: all pass. Report the exact test count.

- [ ] **Step 3: Deploy**

```bash
vercel link
vercel env add NPR_CDS_TOKEN production preview   # paste from ~/.config/npr-cds/token, never echo it
vercel env add CRON_SECRET production
vercel deploy
```

Add Blob storage in the Vercel dashboard, which sets `BLOB_READ_WRITE_TOKEN` automatically. Then run the job once by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<deployment>/api/cron/build-day`.

- [ ] **Step 3b: Write the second decision record** `docs/decisions/002-attribute-at-station-level.md`. WBEZ files no web link on any story and WNYC sometimes omits one, so an item that cannot be linked to its own page is instead linked to the newsroom that filed it. Cover: what NPR's display-only terms actually require ("attribute via url"); that a station-level link is weaker than a story link and whether it satisfies those terms is **a question for NPR Member Partnership, not something this project settled on its own**; the alternative that was rejected (dropping unlinkable items, which would have emptied Chicago out of a six-newsroom product); and what would change it (WBEZ starting to file `webPages`, or written guidance either way). Leave "What actually happened" blank for Tarik.

- [ ] **Step 4: Write the decision record** `docs/decisions/001-stream-never-store.md` covering: why audio streams from each publisher instead of being cached (NPR premium audio is play-or-link; other stations' content is display-only), what that costs (a tunnel on the drive is silence, and no offline mode), and what would change it (written permission from NPR Member Partnership and from each station).

- [ ] **Step 5: Write the README** — what it is, how the day file works, the six newsrooms, how to run it locally, and the rights rules in the same plain words the game uses.

- [ ] **Step 6: Commit and push**

```bash
git add -A && git commit -m "feat: ship the hour player on vercel"
git push -u origin main
```

---

---

### Task 9: Speak the reads

**Files:**
- Create: `lib/reads.ts`, `lib/reads.test.ts`
- Modify: `app/api/cron/build-day/route.ts`, `lib/playlist.ts`, `.env.example`

**Interfaces:**
- Consumes: `WireItem` (Task 1), `putDay` (Task 4), `toPlaylist` (Task 6).
- Produces: `scriptPrompt(item: WireItem): string`, `readKey(item: WireItem, script: string): string`, `voiceRead(item: WireItem): Promise<string>` returning the cached mp3 URL.

**Why this shape.** A read has to be in our own words: display-only rights let us summarise and link, not perform a publisher's text. So the job writes a short script from the headline and the feed's summary, names the source out loud ("NPR reports..."), and only then voices it.

**Two voices behind one function.** `speak()` picks a backend from the environment: ElevenLabs when `ELEVENLABS_API_KEY` is set, otherwise Gemini. Tarik has an ElevenLabs subscription, so those credits are already paid for and the voice is better; Gemini is the overflow valve and the zero-subscription path.

- **The sums.** A 30-second read is roughly 75 words, about 450 characters. ElevenLabs bills 1 credit per character, so a dozen reads a day is about 5,400 credits a day and **162,000 a month** — more than the Creator tier's 121k, comfortably inside Pro's 600k. Gemini bills $10 per million audio tokens at 25 tokens a second: about 1.5¢ a minute, near 9¢ for that same day.
- **Default voice:** `onwK4e9ZLuTAKqWW03F9` ("Daniel — Steady Broadcaster"), already in Tarik's library. A cloned 88Nine host voice is a later swap of that one id.
- **Known snag:** the API key behind the ElevenLabs MCP connector lacks the `user_read` permission, so credit balance cannot be read programmatically (401, `missing_permissions`). Either issue a key with usage permission or watch the dashboard.

- [ ] **Step 1: Write the failing test** in `lib/reads.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptPrompt, readKey } from './reads.ts';
import type { WireItem } from './types.ts';

const item: WireItem = { id: 'g-s308-6913', src: 'WBEZ', how: 'station', kind: 'seg',
  title: "How Chicago's arts spending compares with other cities", teaser: 'The mayor wants his arts investments to define the administration.',
  url: 'https://www.wbez.org', topic: 'local', when: '2026-09-16', len: 0 };

test('the script prompt asks for our own words, with the source named aloud', () => {
  const p = scriptPrompt(item);
  assert.match(p, /own words/i);
  assert.match(p, /WBEZ/);
  assert.match(p, /55 words|about 30 seconds/i);
  assert.ok(!p.includes('verbatim'));
});

test('the cache key changes when the script changes', () => {
  assert.notEqual(readKey(item, 'first script'), readKey(item, 'second script'));
  assert.equal(readKey(item, 'same'), readKey(item, 'same'));
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `./reads.ts` does not exist.

- [ ] **Step 3: Implement `lib/reads.ts`**

```ts
import 'server-only';
import { createHash } from 'node:crypto';
import { put, head } from '@vercel/blob';
import type { WireItem } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const scriptPrompt = (item: WireItem) => [
  `Write a radio read of about 55 words — about 30 seconds out loud — in your own words.`,
  `Name the source aloud once, like "${item.src} reports".`,
  `No adjectives you cannot source, no speculation, no sign-off.`,
  ``,
  `Headline: ${item.title}`,
  `What the newsroom says it is about: ${item.teaser}`,
].join('\n');

export const readKey = (item: WireItem, script: string) =>
  `reads/${item.id}-${createHash('sha256').update(script).digest('hex').slice(0, 12)}.mp3`;

type Voice = 'elevenlabs' | 'gemini';
export const backend = (): Voice => (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini');

const ELEVEN_VOICE = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — Steady Broadcaster

async function elevenSpeak(script: string): Promise<{ audio: Buffer; type: string }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ text: script, model_id: 'eleven_turbo_v2_5' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return { audio: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' };
}

async function gemini(model: string, body: unknown) {
  const res = await fetch(`${API}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function voiceRead(item: WireItem): Promise<string> {
  const written = await gemini('gemini-2.5-flash', { contents: [{ parts: [{ text: scriptPrompt(item) }] }] });
  const script: string = written.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!script) throw new Error(`no script for ${item.id}`);

  const key = readKey(item, script);
  try { return (await head(key)).url; } catch { /* not voiced yet */ }

  const spoken = await gemini('gemini-2.5-flash-preview-tts', {
    contents: [{ parts: [{ text: script }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  });
  const b64 = spoken.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`no audio for ${item.id}`);
  // Gemini returns raw PCM; wrap it as a WAV so browsers will play it.
  const pcm = Buffer.from(b64, 'base64');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  const { url } = await put(key.replace(/\.mp3$/, '.wav'), wav, { access: 'public', contentType: 'audio/wav', addRandomSuffix: false });
  return url;
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Voice one read for real**

```bash
GEMINI_API_KEY=... BLOB_READ_WRITE_TOKEN=... node --conditions=react-server --import tsx -e "
import('./lib/reads.ts').then(async (m) => {
  const url = await m.voiceRead({ id: 'test-1', src: 'WBEZ', how: 'station', kind: 'seg',
    title: \"How Chicago's arts spending compares with other cities\",
    teaser: 'The mayor wants his arts investments to define the administration.',
    url: 'https://www.wbez.org', topic: 'local', when: 'today', len: 0 });
  console.log(url);
});"
```
Note the `--conditions=react-server` flag: `lib/reads.ts` opens with `import 'server-only'`, which throws under any other condition. A bare `pnpm exec tsx -e` fails here, and the failure reads like a bug in the module. It is not. **Do not delete the guard to make the command run.**

Expected: a Blob URL. Open it and listen: about 30 seconds, the source named once, no invented detail. If the voice reads the teaser back verbatim, the prompt failed — fix the prompt, not the output.

- [ ] **Step 6: Voice the day's reads during the cron**

In `app/api/cron/build-day/route.ts`, after `buildDay()`, voice every item with no tape and attach the URL:

```ts
for (const item of [...day.network, ...Object.values(day.stations).flatMap((s) => s.local)]) {
  if (!item.audio) { try { item.audio = await voiceRead(item); item.spoken = true; } catch { /* a missing read is a card, not a failure */ } }
}
```

Add `spoken?: boolean` to `WireItem` in `lib/types.ts`, and in `lib/playlist.ts` let a spoken read stream like any other item: `b.mode === 'read' && b.spoken` qualifies alongside tape.

- [ ] **Step 7: Check the bill**

Run the cron once and count: reads voiced × 30 seconds × $10 per million audio tokens at 25 tokens a second works out near 9¢ for a dozen reads. Put the real figure in the report.

- [ ] **Step 8: Commit**

```bash
git add lib/reads.ts lib/reads.test.ts app/api/cron/build-day/route.ts lib/playlist.ts lib/types.ts .env.example
git commit -m "feat: voice the reads with gemini tts, in our own words"
```


---

### Task 10: The front page — desks, and the mix bar

**Files:**
- Create: `lib/desks.ts`, `lib/desks.test.ts`, `components/Desks.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `classify` and `Topic` (Task 2), `WireItem` (Task 1), `Block` (Task 5).
- Produces: `byDesk(items: WireItem[]): Desk[]` and `mixOf(hour: Block[]): Mix`.

**Why this exists.** A producer filling an hour is doing what a front-page editor does: not just "is this good" but "do I already have three of these". The plan already scores Mix at 15 of 100 points and already lets a listener pick three subjects (Task 7) — but neither is visible while you build. This task makes the desk the organising idea on screen: the wire arrives sorted into sections in a fixed newspaper order, and the rail carries a bar showing what the hour currently is, so a politics-heavy hour is obvious before you press air rather than in the aircheck afterwards.

**Desk order is fixed, not alphabetical and not by count**, because a front page has a shape a reader learns: `news, politics, world, economy, health, tech, climate, culture, music, local`. Empty desks do not render.

- [ ] **Step 1: Write the failing test** in `lib/desks.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byDesk, mixOf, DESK_ORDER } from './desks.ts';
import type { Block, WireItem } from './types.ts';

const item = (id: string, topic: WireItem['topic']): WireItem =>
  ({ id, src: 'NPR', how: 'satellite', kind: 'seg', title: id, teaser: '', url: 'https://npr.org/' + id, topic, when: '2026-09-16', len: 120 });

const block = (id: string, topic: Block['topic'], len = 120): Block =>
  ({ id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic });

test('the wire arrives in newspaper order, and empty desks do not render', () => {
  const desks = byDesk([item('a', 'music'), item('b', 'politics'), item('c', 'politics')]);
  assert.deepEqual(desks.map((d) => d.topic), ['politics', 'music']);
  assert.equal(desks[0].items.length, 2);
  assert.ok(!desks.some((d) => d.items.length === 0));
});

test('desk order follows DESK_ORDER, not the order stories arrived', () => {
  const desks = byDesk([item('a', 'local'), item('b', 'news')]);
  assert.deepEqual(desks.map((d) => d.topic), ['news', 'local']);
  assert.equal(DESK_ORDER[0], 'news');
});

test('the mix reports each desk as a share of programming seconds', () => {
  const mix = mixOf([block('a', 'politics', 300), block('b', 'world', 100)]);
  assert.equal(mix.total, 400);
  assert.equal(mix.shares.find((s) => s.topic === 'politics')?.seconds, 300);
  assert.ok(mix.shares[0].topic === 'politics', 'the heaviest desk is first');
});

test('an hour that is mostly one desk says so, and an even one does not', () => {
  assert.equal(mixOf([block('a', 'politics', 300), block('b', 'world', 100)]).lopsided, 'politics');
  assert.equal(mixOf([block('a', 'politics', 200), block('b', 'world', 200)]).lopsided, null);
});

test('fixed furniture is not part of the mix', () => {
  const mix = mixOf([block('a', 'politics', 300), { ...block('id', 'news', 60), fixed: true }]);
  assert.equal(mix.total, 300);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `./desks.ts` does not exist.

- [ ] **Step 3: Implement `lib/desks.ts`**

```ts
import type { Block, Topic, WireItem } from './types';

// A front page has a shape a reader learns. This order is deliberate: not alphabetical,
// not by how many stories happen to have landed.
export const DESK_ORDER: Topic[] = ['news', 'politics', 'world', 'economy', 'health', 'tech', 'climate', 'culture', 'music', 'local'];

export const DESK_NAME: Record<Topic, string> = {
  news: 'News', politics: 'Politics', world: 'World', economy: 'Business', health: 'Health',
  tech: 'Science & Tech', climate: 'Climate', culture: 'Arts & Culture', music: 'Music', local: 'Around town',
};

export type Desk = { topic: Topic; name: string; items: WireItem[] };
export type Mix = { total: number; shares: { topic: Topic; name: string; seconds: number; share: number }[]; lopsided: Topic | null };

export const byDesk = (items: WireItem[]): Desk[] =>
  DESK_ORDER
    .map((topic) => ({ topic, name: DESK_NAME[topic], items: items.filter((i) => i.topic === topic) }))
    .filter((d) => d.items.length > 0);

// What the producer actually built, by seconds rather than by story count: one 12-minute
// documentary is a bigger share of the hour than four 90-second spots.
export function mixOf(hour: Block[]): Mix {
  const real = hour.filter((b) => !b.fixed && !b.window && !b.credit && !b.music);
  const total = real.reduce((n, b) => n + (b.realLen ?? b.len), 0);
  const shares = DESK_ORDER
    .map((topic) => {
      const seconds = real.filter((b) => b.topic === topic).reduce((n, b) => n + (b.realLen ?? b.len), 0);
      return { topic, name: DESK_NAME[topic], seconds, share: total ? seconds / total : 0 };
    })
    .filter((s) => s.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  // Half the hour on one desk is the point at which a listener notices.
  const lopsided = shares[0] && shares[0].share > 0.5 ? shares[0].topic : null;
  return { total, shares, lopsided };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS, all five.

- [ ] **Step 5: Build `components/Desks.tsx`**

Two exports, both plain and both server-renderable except where the click handler forces a client boundary:

- `<Wire items={...} onAdd={...} />` — the day's wire as a front page. One `<section>` per desk from `byDesk()`, an `<h2>` carrying the desk name and its story count, and each story a row with its headline, source, runtime (or the word **read** when `len` is 0), and a link out to the publisher. Every row keeps the source and link the rights rules require — the desk grouping never replaces attribution.
- `<MixBar hour={...} />` — a single horizontal bar above the rail, one segment per desk from `mixOf().shares`, widths as percentages, each segment labelled with the desk name and its minutes when the segment is wide enough to hold text. When `mixOf().lopsided` is set, one line under the bar reads: *"More than half your hour is <desk name>."* — a note, never a blocker; a producer is allowed to build a politics hour on purpose.

Accessibility: the bar is decorative, so give it `aria-hidden` and put the same numbers in a visually-hidden list beside it. Do not encode the desk by colour alone — each segment carries its name in text or in a `title`.

- [ ] **Step 6: Use it** in `app/page.tsx`

Replace the flat wire list from Task 8 with `<Wire>`, and put `<MixBar>` at the top of the rail.

- [ ] **Step 7: Check it against a real day**

Run `pnpm dev` (port 3020 or 3030 — port 3000 is an unrelated server on this Mac and must not be touched), open the app, and confirm: at least four desks render from the day's wire; no desk heading appears with zero stories; every story row shows its source and links out; adding three politics pieces makes the bar go majority-politics and the lopsided line appear.

Report how many desks the real day produced and how many stories landed on each. If everything is on one or two desks, the classifier from Task 2 Step 3b is under-matching — say so in the report with the headlines it missed; do not widen the patterns without recording which story forced each change.

- [ ] **Step 8: Commit**

```bash
git add lib/desks.ts lib/desks.test.ts components/Desks.tsx app/page.tsx
git commit -m "feat: the wire as a front page, with a mix bar over the hour"
```

---

---

### Task 11: The hot clock

**Files:**
- Create: `lib/clock.ts`, `lib/clock.test.ts`, `components/HotClock.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `layout()` from Task 5 (which already returns `rows` of `{ b, at }` — the block and the second it starts).
- Produces: `arcs(rows, opts): Arc[]` where `Arc = { id; label; startAt; seconds; a0; a1; kind; minWidthApplied }`.

**The reference.** Tarik supplied NPR's own printed hot clock for *Morning Edition*, effective 13 August 2018, as the model. It is a ring read clockwise from 12 o'clock, outer ticks marking clock time and inner numbers marking each element's duration, with five lettered local segments (A–E) and a five-colour key. Transcribed in full, because the implementer will not see the image:

| At | Element | Runs | Class |
|---|---|---|---|
| 0:00 | BILLBOARD | 0:50 | promo |
| 1:00 | NEWSCAST 1 | 2:59 | newscast |
| 4:00 | NEWSCAST 2 | 1:39 | newscast |
| 5:40 | funding credit | 0:19 | credit |
| 6:00 | MUSIC | 1:29 | bed |
| 7:30 | SEGMENT A | 11:29 | segment |
| 19:00 | MUSIC | 1:29 | bed |
| 20:30 | FA PROMO | 0:29 | promo |
| 21:00 | funding credit | 0:49 | credit |
| 21:50 | SEGMENT B | 7:09 | segment |
| 29:00 | MUSIC | 0:29 | bed |
| 29:30 | ATC PROMO | 0:29 | promo |
| 30:00 | NEWSCAST 3 | 1:29 | newscast |
| 31:30 | NEWSCAST 4 | 0:59 | newscast |
| 33:00 | MUSIC | 0:34 | bed |
| 34:35 | funding credit | (short) | credit |
| 34:35 | SEGMENT C | 7:54 | segment |
| 42:30 | MUSIC | 1:29 | bed |
| 44:30 | H&N PROMO | 0:29 | promo |
| 45:00 | RETURN | 0:29 | promo |
| 45:35 | funding credit | 0:34 | credit |
| 45:35 | SEGMENT D | 3:59 | segment |
| 49:35 | MUSIC | 1:54 | bed |
| 51:30 | SEGMENT E | 7:29 | segment |
| 59:00 | SILENCE | 0:05 | silence |

Its key: grey = segment, black = newscast, light blue = promo, slate = music bed, red = funding credit.

**What to take from it, and what not to.** Take the vocabulary and the visual grammar: a ring clockwise from 12, ticks on the outside, durations on the inside, each element a wedge sized by its true length. **Do not copy its accessibility.** The poster carries meaning in colour with the key in a far corner, rotates labels ninety degrees, renders a 0:05 element as a hairline no thumb could hit, and — as an image — says nothing at all to a screen reader. Those are four defects to fix, not features to reproduce:

1. **Never colour alone.** Every wedge carries a second channel: a distinct SVG pattern fill (solid / hatched / dotted / crosshatch / open) as well as its colour, and its name in text or a `<title>`. Confirm each pair of adjacent classes differs in luminance, not only in hue, so the ring reads in greyscale.
2. **No rotated text.** Labels sit horizontally in a legend column beside the ring, connected by leader lines or by number, not curved around the arc. Wedges narrower than about 20° get a number only, resolved in the legend.
3. **A floor on wedge size.** An element shorter than 20 seconds still draws at a 20-second arc so it is visible, and sets `minWidthApplied: true` so the UI can mark it. The true duration always appears in the label — the arc may exaggerate; the number never does.
4. **The ring is not the control.** It is `aria-hidden`, and the same data renders as a visually-hidden `<ol>`: *"1. Billboard, starts 0:00, runs 50 seconds, promo."* The interactive, keyboard-operable surface is the linear rail beside it. This is the whole accessibility strategy in one sentence: **the clock is the picture, the rail is the control.** Do not add click handlers, focus rings or `tabindex` to any arc.

**It must not fight Task 10's mix bar.** They answer different questions and must use different visual channels: the **clock encodes what kind of element** (segment, newscast, promo, bed, credit, silence, window); the **mix bar encodes what the hour is about** (the desks). Never colour the clock by desk.

- [ ] **Step 1: Write the failing test** in `lib/clock.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arcs, HOUR } from './clock.ts';

const row = (id: string, at: number, len: number, extra = {}) =>
  ({ at, b: { id, label: id, len, how: 'satellite', kind: 'seg', mode: 'tape', topic: 'news', ...extra } }) as any;

test('the hour starts at twelve o clock and runs clockwise', () => {
  const [a] = arcs([row('a', 0, 900)]);
  assert.equal(a.a0, 0);
  assert.equal(a.a1, 90, 'fifteen minutes is a quarter turn');
});

test('an element keeps its true seconds even when the arc is widened', () => {
  const [a] = arcs([row('silence', 59 * 60, 5)]);
  assert.equal(a.seconds, 5, 'the number never lies');
  assert.ok(a.a1 - a.a0 >= (20 / HOUR) * 360 - 1e-9, 'the arc is floored so it can be seen');
  assert.equal(a.minWidthApplied, true);
});

test('an element longer than the floor is drawn at its true width', () => {
  const [a] = arcs([row('seg', 0, 11 * 60 + 29)]);
  assert.equal(a.minWidthApplied, false);
  assert.ok(Math.abs((a.a1 - a.a0) - ((11 * 60 + 29) / HOUR) * 360) < 1e-9);
});

test('every arc is classified, and the classes match the reference key', () => {
  const out = arcs([row('wx', 19 * 60, 45, { window: true }), row('uw', 21 * 60, 30, { credit: true }), row('cast', 0, 179, { kind: 'newscast' })]);
  assert.deepEqual(out.map((a) => a.kind), ['window', 'credit', 'newscast']);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm test`
Expected: FAIL — `./clock.ts` does not exist.

- [ ] **Step 3: Implement `lib/clock.ts`** — pure geometry, no DOM. `HOUR = 3600`. Degrees, not radians, so the tests read like a clock face. `MIN_ARC_SECONDS = 20`. Classify each row in this order, first match wins: `silence`, `credit`, `window` (weather and traffic), `bed` (music), `promo`, `newscast` (`kind === 'newscast'`), else `segment`.

- [ ] **Step 4: Run the tests**

Run: `pnpm test`
Expected: PASS, all four.

- [ ] **Step 5: Build `components/HotClock.tsx`**

An SVG ring, `viewBox="0 0 320 320"`, each arc an annular `<path>`. Ticks every minute on the outside, longer at each five. `12:00` marked START. Pattern fills defined once in `<defs>`. The whole `<svg>` carries `aria-hidden="true"`; beside it, a `<ol>` in a visually-hidden class lists every element as a sentence with its start, duration and class. A visible legend column lists each class once with its swatch, its pattern and its name.

Responsive rule from the global constraints: below roughly 480px the ring shrinks to fit the gutter and the legend stacks beneath it; the ring never forces a horizontal scroll. Respect `prefers-reduced-motion` — if arcs animate as blocks are added, skip the animation entirely under that query.

- [ ] **Step 6: Place it** in `app/page.tsx`, above the linear rail, with the rail remaining the only interactive surface.

- [ ] **Step 7: Check it**

Build a real hour and confirm, saying which you verified and how: the wedges sum to a full circle; a 0:05 element is visible and labelled "0:05"; the ring is legible with colour removed (screenshot converted to greyscale, or a greyscale CSS filter); a screen reader or the accessibility tree reads the hidden list in order; at 390px wide the page does not scroll sideways.

- [ ] **Step 8: Commit**

```bash
git add lib/clock.ts lib/clock.test.ts components/HotClock.tsx app/page.tsx
git commit -m "feat: a hot clock that reads like NPR's, and reads aloud too"
```

---

## Parked for later plans

- **Phaser and the pixel newsroom.** The loop has to hold people before it gets art. Sprite generation through the spritecook connector, original characters only.
- **A cloned host voice.** ElevenLabs voice cloning so the reads sound like 88Nine rather than a stock voice. Roughly 17¢ a minute against Gemini's 1.5¢, so it is a branding purchase, not a cost saving.
- **Streaks and a leaderboard across devices.** Needs accounts; local streaks first.
- **The news-director layer.** Assign reporters, watch the beats, live with the budget.
- **Other stations' audio inside the stream.** Needs a phone call to each newsroom, not a code change.
- **The furniture the reference clock has and our hour does not.** NPR's printed Morning Edition clock (transcribed in Task 11) carries a 0:50 billboard at the top, four newscasts rather than one, a music bed between almost every element (over six minutes of the hour), four promo slots, four separate funding credits, and a 0:05 silence at 59:00 for the station to join on. Our hour is a **local** hour — the 9 a.m. hour after Morning Edition ends, where the station fills everything — so the network clock is a vocabulary and a visual model, not a rundown to copy. Whether to add billboards, beds and promos as real schedulable furniture is a product decision for Tarik, not something to infer: it would make the hour markedly more realistic and markedly more fiddly to fill.
