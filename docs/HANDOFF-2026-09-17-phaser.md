# Handoff — 2026-09-17, 06:40, picking up the Phaser rebuild

Written for a session with no memory of the night that produced this. Read this, then
`docs/phaser-design.md`, then the browser-audio section of `docs/roadmap.md`. That is the whole
briefing.

---

## Where the code is, exactly

| | |
|---|---|
| Branch | `feat/hour-player`, **156 commits** past `main` (`fa776bf`) |
| HEAD | `59399e5`, pushed, **CI green**, working tree clean |
| Tests | **203 pass, 0 fail** — `pnpm test` |
| Not merged | nothing has reached `main`; `main` is protected and requires CI |
| Never deployed | `vercel deploy` has not been run, not once. There is no live URL |

Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint` before believing anything. A green test suite
does **not** mean the build is clean — the runner strips types without checking them — and it does
not mean the app works. That was proved twice last night.

---

## What this is

**Nine O'Clock Hour.** A cron wakes at 5 a.m., pulls NPR's real Content Distribution Service wire,
classifies each story to a desk, and writes one day file to Vercel Blob. Every story that arrives as
text is voiced with Gemini and cached. A producer then fills the 9 a.m. hour from that wire against
a hot clock, puts it on air, hears it, and gets an aircheck — five scores and a modelled listener
retention curve.

It works. The 5 a.m. job has run for real against the live wire.

---

## THE DECISION THAT MATTERS: the interface is being rebuilt in Phaser

Taken by Tarik on 2026-09-17 after using the React build all night.

**What survives — everything except the drawing:**

- all 18 `lib/*.ts` files — wire, day builder, storage and sweeps, recordings, weather, legal ID,
  scoring, rights rules, hot-clock geometry, rules, `landOn()`
- both API routes — `app/api/cron/build-day`, `app/api/audition`
- 19 test files
- **the 5 a.m. cron does not change at all**

None of it imports React. A card is only a new way to draw a `WireItem` the engine already
understands.

**What is replaced:** 6 React components and 4 CSS modules in `components/`.

**Do not delete them yet.** They are the working reference for behaviour the Phaser build has to
reproduce, and they are the only place some of it is written down outside the docs.

---

## Read these two documents before writing code

### 1. `docs/phaser-design.md` — the design, decided not proposed

Summarised, but read the whole thing:

- **You are a producer at five in the morning**, assembling. Not the host on air.
- **Time is what you spend.** You cannot audition 26 stories before nine, and neither can a real
  producer. That constraint is the game.
- **Cards show five signals and no words** — desk colour, length, rights, freshness, untimed.
- **Flip to read, preview to hear.** Both cost clock; hearing costs more.
- **One price for moving or removing a card.** The real cost is the *reflow* — `layout()` already
  computes which fixed window a shifted block now crashes into.
- **The wire keeps arriving.** The bulletin becomes the rhythm, not one modal at the end.
- **At nine the player chooses**: the whole hour, or the joins. Aircheck either way.
- **The hour is a real news product**, not a scored attempt. A bad score must still sound good.
- **Whole-hour playback with scrubbing, along the RUNDOWN clock** — not along the audio. They are
  different lengths because silence does not air.
- **Non-negotiable:** the newsroom's content, their audio streamed from their servers, and a link to
  their story. Nothing copied or re-hosted. The only audio this project stores is audio it made.

### 2. `docs/roadmap.md`, the browser-audio section — the hard-won part

**The single most valuable finding of the night, and it is counter-intuitive:**

> **The silent unlock clip has never played. Not once.**
>
> The app spends the first tap on five milliseconds of silent audio to earn permission to play. An
> implementer instrumented the element and watched the *shipped* code: `play()` is called, `cue()`
> pauses immediately because the block is silent, and the clip is aborted before a frame sounds —
> *"The play() request was interrupted by a call to pause()."*
>
> So the whole mechanism rests on an **unwritten premise**: that the browser grants permission when
> `play()` is *called* inside a gesture, not when playback *succeeds*. Nobody had written that down.
> If it were false, iPhones would already be silent.

**And the thing Phaser gains:** `HTMLMediaElement` exposes no way to ask whether the grant landed.
**Web Audio does.** `await ctx.resume()` inside the tap, then assert `ctx.state === 'running'`. The
load-bearing assumption becomes an assertion. **Build that first, not last.**

Also in that section: why "wait for the unlock to land" is impossible, why an "unlocked yet" flag is
useless, and the method note that matters more than any of it — **196 tests passed through both a
broken player and a fixed one; everything real came from logging what the browser did to the
element.** Build that harness early.

---

## Assets that exist

**In `~/Desktop/nine-oclock-audio/`** — generated last night, approved by Tarik ("audio sounds good"):

| file | what |
|---|---|
| `legal-id-88nine.wav` | *"You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee"*, 6.1s |
| `weather-milwaukee.wav` | a real NWS forecast read, 26.4s |
| `lofi-3-00.mp3` · `lofi-4-30.mp3` · `lofi-6-30.mp3` | music beds, generated once to be reused forever |
| `music-bed-3-00.mp3` | an earlier style Tarik rejected — kept, not deleted |

**The lofi beds are approved in style but NOT yet wired into anything.** They exist only as files.

**In Vercel Blob:** `days/` 2 objects, `reads/` 63 objects, `ids/` and `wx/` **empty** — the legal ID
and weather features landed *after* the last cron run, so nothing has recorded them yet.

**Consequence you will see immediately:** the app currently shows *"Legal ID (no wording on file)"*
and an empty weather window for every station. **That is correct behaviour on stale data, not a
bug.** A fresh cron run fixes it — costs a couple of minutes and a few cents.

---

## Open questions for Tarik

1. **How long is the morning?** Four hours of story time compressed into how much real play.
2. **How many cards on screen at once?** 26 is a lot of canvas. All there at five, or arriving in
   waves — which would also be truer.
3. **The reads' quality bar.** If people listen end to end rather than sampling 15 seconds, the
   script prompt deserves a pass. Fine as a preview; different standard as the product.

---

## Rules that are not negotiable

- **Port 3000 on this Mac is an unrelated server. Never start, stop, or test against it.** Use
  **3030**.
- **Never `git add -A` or `git add .`** — name every file.
- **The repo is public.** A secret in a commit cannot be un-published. The NPR CDS token lives at
  `~/.config/npr-cds/token` — never print, commit or embed it.
- **`vercel deploy` needs Tarik's explicit go-ahead.** Every time.
- **Running the cron spends money and writes real storage.** Ask first.
- Commit trailers, every commit:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JipzCzK5wGnEtupZP1na2E
  ```

## Process rules learned the hard way last night

- **Once an implementer reports, send it nothing that could cause an edit.** The commit range moved
  under a reviewer **three times**, every time because a correction reached a frozen agent. Cautions
  go in the next review brief or a new round.
- **Gate every commit on typecheck, lint and tests passing.** A commit chained behind a step that
  failed silently shipped a red build once.
- **Look at the screen.** Four separate defects last night passed a green suite and were found only
  by loading the page: a payoff screen that rendered `badYou passed on the bulletin.`, a clock
  printing `0:60`, an hour counter running backwards, and a player that looked frozen while working.
- **Read the shape, do not guess it.** Roughly every failed command last night was a guessed field
  name, heading level, function signature or output format.

---

## What I would do first

1. **Run the cron once** (with Tarik's go-ahead) so `ids/` and `wx/` are populated and the app shows
   a real legal ID and a real forecast. Everything is easier to reason about with live data.
2. **Open the Phaser project** and scaffold against `docs/phaser-design.md`.
3. **Build the audio unlock properly, first.** `await ctx.resume()` inside the tap, assert
   `ctx.state === 'running'`, and build the element-logging harness at the same time. This path has
   broken three times; it is the thing to get right before anything is built on top of it.
4. **Build links as real DOM anchors over the canvas**, not painted rectangles. Attribution and
   accessibility both depend on it, and both are easy to lose quietly.
5. **Wire the lofi beds in** — three files, stored once, never swept. They do not go stale.

## What nobody has verified, still

- **Nobody has opened this on an iPhone.** The check is written beside `unlock()` in
  `lib/player.ts`: open a normal hour, tap Play **once**, then *watch the button for a full minute*
  rather than listening. The first block is silent by design, so hearing nothing proves nothing.
- **Nobody has heard a weather read inside the app.** One was produced outside it and approved.
- **No screen reader. No real phone. Chrome only.**
