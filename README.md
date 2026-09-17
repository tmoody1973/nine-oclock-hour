# Nine O'Clock Hour

> Fill a radio news hour from the day's real wire. Press air. Find out how it went.

## What this is

Public radio producers build an hour against a **hot clock** — a fixed map of where the
newscast, the weather window and the underwriting credit have to land, with the gaps in
between for them to fill. Getting it right is a craft, and it is almost completely
invisible to the people listening.

This turns that craft into something you can do. Every morning a job pulls the real wire
from NPR's Content Distribution Service — the actual feed member stations work from — and
lays out the day's stories. You pick what goes in the 9 a.m. hour, in what order, as tape
or as a 30-second read. Then you press air, hear the hour play, and get an **aircheck**:
how close you landed to the top of the hour, what you crashed, how fresh it was, and a
modelled line showing where a listener would have switched off.

It is built on real material, so the day you play is the day that actually happened.

## Status

**The loop runs end to end.** A real morning's wire comes in, you build the hour, put it on
air, and get an aircheck. The repo is public from the first commit, so here is exactly where
it stands:

| | |
|---|---|
| ✅ Done | Server-side CDS reads · the desk classifier · the day-file builder · the 5 a.m. cron to Blob · the rules engine · the player · the retention meter · spoken reads · the front page · the hot clock |
| 🔨 Next | The first deploy. The Vercel config and the cron schedule are committed; nothing is deployed yet. |
| ⬜ Planned | Decision records under `docs/decisions/` |

There is no deployed URL yet. The prototype the rules and scoring were ported from is still
in the repo, at `prototype/index.html`, as the reference.

The full plan, task by task with the code and the tests, is in
[`docs/superpowers/plans/2026-09-16-hour-player.md`](docs/superpowers/plans/2026-09-16-hour-player.md).

## How it works

In the order it happens, rather than as a list of parts:

1. **At 5 a.m. Central a scheduled job wakes up.** A cron — a job that runs on a timer —
   asks NPR's Content Distribution Service for the morning's Morning Edition and All
   Things Considered segments, the current hourly newscast, and recent local pieces from
   six member stations.
2. **It writes one file for the whole day.** Every story is reduced to metadata: headline,
   source, runtime, a link back, and a desk. That file goes to Vercel Blob (a file store)
   under today's date, so every player that day works from identical material and nobody
   hammers the API.
3. **Your browser reads that one file** and shows you the wire, sorted into desks like a
   newspaper front page.
4. **You build the hour.** Drag stories into the rail. Anything with no tape becomes a
   30-second read. A clock shows you where everything lands and what you are about to
   crash into.
5. **You press air.** The hour plays through a single audio element, with lock-screen
   controls so it survives a commute. Audio streams from whoever published it — we never
   hold a copy.
6. **You get an aircheck.** Five scores, the notes, and a retention line — plus what the
   network actually did that same morning, so you can see where the professionals put the
   light story.

## The rules that shape it

These are not flavour. They are why the app is built the way it is.

- **Store metadata, never audio.** Titles, runtimes, links and rights flags only. NPR
  premium audio is *play it or link to it, never store or download it*. Every stream comes
  from the publisher at play time.
- **Other newsrooms' items are display-only.** Attribute by URL, refresh regularly, do not
  hold beyond display. So every item on screen carries its source and a link back — there
  is no view in this app where a story appears without saying who filed it.
- **Network tape comes down the satellite and is yours to air. Another station's tape
  needs a phone call.** In v1, other stations' audio links out to their own player rather
  than playing inside our stream.
- **Reads are our own words.** An item with no tape becomes a script we write and voice,
  naming the source aloud — never a publisher's copy performed, which display-only rights
  do not allow.
- **Some feeds file audio with no duration.** WBEZ and KQED do. That became a rule: untimed
  tape only reveals its real length once it is on air, exactly as it would in a studio.

## The six newsrooms

Each has a neighbour whose tape you cannot simply roll.

| Station | City | CDS owner |
|---|---|---|
| 88Nine Radio Milwaukee | Milwaukee | `s921` |
| KCRW | Los Angeles | `s55` |
| WBEZ | Chicago | `s308` |
| WNYC | New York | `s552` |
| WABE | Atlanta | `s295` |
| KQED | the Bay Area | `s150` |

Network sources: Morning Edition is CDS collection `3`, All Things Considered `2`, the NPR
News Now hourly newscast is podcast channel `500005`, and member-station local pieces carry
collection `319418027`.

## The hour

Ported from the prototype and unchanged:

- 59 minutes of programming plus a 1:00 legal ID
- Weather window, 45s, immovable at **19:00**
- Traffic window, 45s, immovable at **49:00**
- An underwriting credit, 30s, that must *start* before **30:00**
- A bulletin, 75s, at **34:00**
- A story with no tape is a 30-second read
- Pledge week: the credit doubles to 60s and two 2:00 pitch breaks appear at 12:00 and 42:00

**Aircheck weights:** Clock 30 · On air 25 · Freshness 15 · Mix 15 · Hold 15.

## The desks

Stories are sorted the way a newspaper sorts them, because an hour that is four politics
pieces deep is a problem you want to see while you are building it, not afterwards:

`news` · `politics` · `world` · `economy` · `health` · `tech` · `climate` · `culture` ·
`music` · `local`

Network stories carry NPR's own topic collection ids, which map onto these directly.
Member-station copy carries no topic at all, so its desk is classified from the headline
and summary. **The desk is the subject, not the place** — a Chicago story about the mayor
belongs on the politics desk; that it came from WBEZ is already on the byline.

## Quick start

### Prerequisites

- Node.js 26+
- pnpm 10+
- An NPR Content Distribution Service token (station credentials)

### Install

```bash
git clone https://github.com/tmoody1973/nine-oclock-hour.git
cd nine-oclock-hour
pnpm install
```

### Run the checks

```bash
pnpm test              # node --test over the pure-logic modules
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

### Develop

```bash
pnpm dev
```

## Environment variables

Server-side only. **None of these ever reaches the browser.**

| Variable | What it is | Needed for |
|---|---|---|
| `NPR_CDS_TOKEN` | NPR Content Distribution Service bearer token | Reading the wire. Required. |
| `CRON_SECRET` | Any long random string; the daily job rejects requests without it | The 5 a.m. build. Required in production. |
| `BLOB_READ_WRITE_TOKEN` | Issued automatically when Blob storage is added to the Vercel project | Storing the day file. Required in production. |
| `GEMINI_API_KEY` | Google AI Studio key | Writing and voicing the reads. Required. |
| `READ_VOICE` | One of the voice names in `lib/voices.ts`, case-sensitive | Optional. Which voice the 5 a.m. build speaks in; defaults to `DEFAULT_VOICE`. The in-app picker only previews voices in the browser — this is the actual lever. |
| `AUDITION_ENABLED` | Set to `1` to turn on `POST /api/audition` | Optional, and off by default: that route is public, unauthenticated, and spends the same Gemini quota the morning build depends on. |

Locally the CDS token is read from `~/.config/npr-cds/token` (mode `600`). It is never
printed, never committed, and never sent to the client.

## Project structure

```
nine-oclock-hour/
├── app/
│   ├── page.tsx                        # serves today's day file, or the most recent one
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── cron/build-day/route.ts     # the 5 a.m. job
│       └── audition/route.ts           # preview a voice; off unless AUDITION_ENABLED=1
├── lib/
│   ├── types.ts                        # the only shared shapes
│   ├── cds.ts                          # server-side CDS reads
│   ├── topics.ts                       # the desk classifier
│   ├── desks.ts                        # the desks, their names and their colours
│   ├── day.ts                          # builds the day file
│   ├── store.ts                        # Blob reads, writes and retention
│   ├── reads.ts                        # writes and voices a 30-second read
│   ├── voices.ts                       # the voice list, shared with the picker
│   ├── pool.ts                         # bounded concurrency for the voicing loop
│   ├── wire.ts                         # the day file as one producer's wire
│   ├── hour.ts                         # pure rules engine and the aircheck
│   ├── clock.ts                        # hot-clock geometry
│   ├── playlist.ts                     # the hour as something playable
│   ├── taste.ts                        # the listener's topic picks, as score weights
│   ├── fixtures/                       # one captured CDS response, one hand-built
│   └── *.test.ts                       # node --test, beside each module
├── components/                         # HourBuilder, Desks, HotClock, Player, Aircheck
├── prototype/index.html                # the working prototype the engine is ported from
├── vercel.json                         # the cron schedule
└── docs/
    ├── superpowers/plans/              # the build plan, task by task
    └── decisions/                      # why things are the way they are  (planned)
```

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript, React 19 |
| Tests | `node --test` with `tsx` — no test framework |
| Hosting | Vercel |
| Scheduled job | Vercel Cron |
| Storage | Vercel Blob (metadata only) |
| Content | NPR Content Distribution Service |
| Voice | Gemini — `gemini-2.5-flash` writes each read, `gemini-3.1-flash-tts-preview` speaks it |

## Not built yet, deliberately

Parked until the loop holds people's attention:

- Pixel art and a Phaser newsroom
- A cloned station host voice
- Streaks and a cross-device leaderboard
- A news-director layer: assign reporters, watch the beats, live with the budget
- Other stations' audio playing inside our stream — that needs a phone call to each
  newsroom, not a code change

## Licence

[MIT](LICENSE) — use it, change it, ship it; keep the notice.

**That covers this code and only this code.** Nothing here licenses the material it reads.
NPR's Content Distribution Service content is governed by NPR's own terms, member stations'
items are display-only, and every piece of audio belongs to whoever recorded it. Those rules
are the reason the app is shaped the way it is — see **The rules that shape it** above.

---

Built by [Tarik Moody](https://github.com/tmoody1973) at 88Nine Radio Milwaukee.
