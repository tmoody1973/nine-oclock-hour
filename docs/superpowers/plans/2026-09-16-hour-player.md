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
"test": "node --import tsx --test \"lib/**/*.test.ts\""
```

Then: `pnpm add -D tsx`

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
- Create: `lib/cds.ts`, `lib/cds.test.ts`, `lib/fixtures/me.json`
- Modify: `.env.example`

**Interfaces:**
- Produces: `cdsQuery(params: Record<string, string>): Promise<CdsDoc[]>`, `toWireItem(doc: CdsDoc, how: How, src: string): WireItem`, and the id table below.

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
});
```

- [ ] **Step 3: Run it**

Run: `pnpm test`
Expected: FAIL — `toWireItem` is not exported.

- [ ] **Step 4: Implement `lib/cds.ts`**

```ts
import 'server-only';
import type { How, Topic, WireItem } from './types';

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

const TOPIC_BY_NAME: Record<string, Topic> = {
  News: 'news', Politics: 'politics', World: 'world', Economy: 'economy', Business: 'economy',
  Health: 'health', Technology: 'tech', Culture: 'culture', Television: 'culture', Climate: 'climate', Music: 'music',
};

export function toWireItem(doc: CdsDoc, how: How, src: string): WireItem {
  const audio = primaryAudio(doc);
  const names: string[] = (doc.collections ?? []).map((c: any) => c.name).filter(Boolean);
  const topic = names.map((n) => TOPIC_BY_NAME[n]).find(Boolean) ?? (how === 'ours' || how === 'station' ? 'local' : 'news');
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
git add lib/cds.ts lib/cds.test.ts lib/fixtures/me.json .env.example
git commit -m "feat: server-side CDS reads with a recorded fixture test"
```

---

### Task 3: Build the day file

**Files:**
- Create: `lib/day.ts`, `lib/day.test.ts`

**Interfaces:**
- Consumes: `cdsQuery`, `toWireItem` from Task 2.
- Produces: `buildDay(now: Date): Promise<DayFile>` and `mostCarried(items: WireItem[]): DayFile['mostCarried']`.

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
    item('a', 'WNYC', 'The Fed raises rates'),
    item('b', 'WBEZ', 'The Fed raises rates again'),
    item('c', 'KQED', 'A strike at the opera'),
  ]);
  assert.equal(out.stations, 2);
  assert.match(out.title, /Fed/);
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

const STOP = new Set(['the','a','an','of','in','on','to','for','and','at','is','are','as','its','after','with','from']);
const keywords = (title: string) => title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !STOP.has(w));

// Two newsrooms are on the same story when their headlines share two significant words.
export function mostCarried(items: WireItem[]): DayFile['mostCarried'] {
  let best = { title: items[0]?.title ?? '', url: items[0]?.url ?? '', stations: 0 };
  for (const item of items) {
    const words = new Set(keywords(item.title));
    const stations = new Set(
      items.filter((other) => keywords(other.title).filter((w) => words.has(w)).length >= 2).map((o) => o.src),
    );
    if (stations.size > best.stations) best = { title: item.title, url: item.url, stations: stations.size };
  }
  return best;
}

export async function buildDay(now = new Date()): Promise<DayFile> {
  const date = now.toISOString().slice(0, 10);
  const q = (params: Record<string, string>) => cdsQuery({ sort: 'publishDateTime:desc', ...params });

  const [me, atc, casts] = await Promise.all([
    q({ collectionIds: '3', limit: '8' }),
    q({ collectionIds: '2', limit: '8' }),
    q({ collectionIds: '500005', limit: '2' }),
  ]);

  const network: WireItem[] = [
    ...casts.map((d, i) => ({ ...toWireItem(d, 'satellite', 'NPR'), kind: 'newscast' as const,
      expires: d.recommendUntilDateTime ?? d.expirationDateTime, old: i > 0 })),
    ...me.map((d) => toWireItem(d, 'satellite', 'Morning Edition')),
    ...atc.map((d) => toWireItem(d, 'satellite', 'All Things Considered')),
  ];

  const stations: DayFile['stations'] = {} as DayFile['stations'];
  for (const [id, s] of Object.entries(STATIONS)) {
    const docs = await q({ collectionIds: '319418027', ownerHrefs: `https://organization.api.npr.org/v4/services/${id}`, limit: '6' });
    stations[id] = { ...s, local: docs.map((d) => toWireItem(d, 'ours', s.name)) };
  }

  const locals = Object.values(stations).flatMap((s) => s.local);
  return { date, builtAt: now.toISOString(), network, stations, mostCarried: mostCarried(locals.concat(network)) };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Prove it against live CDS once**

```bash
NPR_CDS_TOKEN=$(cat ~/.config/npr-cds/token) pnpm exec tsx -e "import('./lib/day.ts').then(async m => { const d = await m.buildDay(); console.log(d.date, d.network.length, Object.keys(d.stations).length, d.mostCarried.stations); })"
```
Expected: today's date, at least 10 network items, 6 stations, and a most-carried count of 2 or more. If a station returns nothing, note it in the report — some newsrooms file rarely — but do not hard-code substitutes.

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
NPR_CDS_TOKEN=$(cat ~/.config/npr-cds/token) CRON_SECRET=local pnpm dev &
curl -s -H "Authorization: Bearer local" http://127.0.0.1:3000/api/cron/build-day | head -c 300
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

Run `pnpm dev`, open the app on an iPhone on the same network, build an hour, press **Play my hour**, then lock the screen.
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

Show the five scores, the retention line, the notes, and underneath: **"What the network actually did"** — the same morning's Morning Edition rundown in order with runtimes, read from `day.network` filtered to `src === 'Morning Edition'`, so a player can see where the professionals put the light story. Add one line naming `day.mostCarried.title` when it is not in the player's hour: *"Every other newsroom carried this. You didn't."*

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

- [ ] **Step 1: Wire the page** — `app/page.tsx` reads today's file with `getDay(new Date().toISOString().slice(0,10))`, falls back to the most recent day in Blob when the cron has not run, and renders the station picker, wire, rail, player and aircheck.

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
GEMINI_API_KEY=... BLOB_READ_WRITE_TOKEN=... pnpm exec tsx -e "
import('./lib/reads.ts').then(async (m) => {
  const url = await m.voiceRead({ id: 'test-1', src: 'WBEZ', how: 'station', kind: 'seg',
    title: \"How Chicago's arts spending compares with other cities\",
    teaser: 'The mayor wants his arts investments to define the administration.',
    url: 'https://www.wbez.org', topic: 'local', when: 'today', len: 0 });
  console.log(url);
});"
```
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


## Parked for later plans

- **Phaser and the pixel newsroom.** The loop has to hold people before it gets art. Sprite generation through the spritecook connector, original characters only.
- **A cloned host voice.** ElevenLabs voice cloning so the reads sound like 88Nine rather than a stock voice. Roughly 17¢ a minute against Gemini's 1.5¢, so it is a branding purchase, not a cost saving.
- **Streaks and a leaderboard across devices.** Needs accounts; local streaks first.
- **The news-director layer.** Assign reporters, watch the beats, live with the budget.
- **Other stations' audio inside the stream.** Needs a phone call to each newsroom, not a code change.
