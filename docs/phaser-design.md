# The Phaser version — what it is and how it plays

Decided in conversation with Tarik on 2026-09-17, after a night of using the React build. This is
the design, not a proposal. Open questions are marked as such at the end.

## Who you are

**A producer at five in the morning, assembling the nine o'clock hour.** Not the host live on air.
The tension is preparation, not performance.

## The one rule everything hangs off

**Time is what you spend.** You have from 5 a.m. to 9 a.m., compressed into a short session. Every
look costs clock. You cannot audition twenty-six stories before nine — **and neither can a real
producer.** That single constraint is what turns a form into a game: the reading you *don't* do
matters as much as the reading you do.

## Stories are cards, and the front of a card has no words

A producer scanning a wire does not read. They glance for the same five things, and the engine
already computes every one of them:

| signal | how it reads on the card | where it comes from |
|---|---|---|
| **Desk** | colour — the eight validated colourblind-safe hues | `lib/desks.ts` |
| **Length** | the big number; `4:40` and `0:30` are different animals | `WireItem.len` |
| **Rights** | may you roll it? satellite = yours · another station = credit and read · podcast = talk about it | `CAN_ROLL`, `lib/wire.ts` |
| **Freshness** | filed this morning, yesterday's, or an expired newscast | `WireItem.old`, `expires` |
| **Untimed** | the `≈` — no duration in the feed, so rolling it is a gamble | `WireItem.est` |

Five signals, readable at a glance, no sentences. **That is the skill the job actually needs**, and
it is what makes triage possible under a clock.

## Two ways to look closer, and both cost

**Flip it over** — headline, teaser, who filed it, and the placement note the engine already writes
(*"No duration in the feed. Roughly three minutes, but nobody timed it. Roll it and you find out
live."*). Cheap. A few seconds of the morning.

**Preview the audio** — it plays. Expensive. You are spending the morning to hear it, so you scrub
the first fifteen seconds rather than sitting through 4:40, exactly as anyone does.

**This is also the missing feature.** Tarik, using the React build: *"how come i don't have a built
in player for listening and streaming stories."* There was none — the wire linked out to the
publisher's website. In the Phaser version the preview **is** that player, and giving it a price
turns a missing feature into the central decision of the game.

### Preview cost is a choice, framed as the shift

Not a difficulty slider. **"Overnight"** (a few flat seconds) versus **"Live morning"** (real time).
Same content, different honesty. Nudge toward the real one — the tension only exists when listening
genuinely costs the morning.

*Worth trying instead, or as well:* preview always runs in real time but you can **bail at any
second**. Then the skill is knowing when you have heard enough, which is the actual craft and a
thing you get better at, rather than a setting you pick once.

## Placing, moving and pulling cards

You place cards onto the hot clock. **You may take them off again, and it costs — one price for
moving and for removing** (Tarik's call: the clock does not care what you intended, and two prices
means explaining two rules).

**The real cost is the reflow, not a penalty.** Pull a story from the middle and everything after it
slides up. `layout()` (`lib/hour.ts`) already walks the hour and reports **crashes** — a block still
running when a fixed window arrives has crashed into it. So pulling a 4:40 piece from position three
means the 5:12 newscast now runs into the weather window at 9:19, **and the engine already knows
that and can say so.** Consequence, not punishment — and it teaches the clock, which is the point.

**On top of that, a small flat time cost that grows as the morning runs out.** Pulling at 5:30 is
cheap; you have hours to repair it. Pulling at 8:50 is expensive, because you do not. That puts the
pressure where the job puts it.

## The wire does not hold still

NPR files all morning. Something better lands at 7:40 and the hour you built is suddenly wrong.
**This is where the bulletin mechanic belongs** — not one modal at the end, but the thing that keeps
happening while you work. The React build already has the bulletin and its three choices:

> *"The Fed has announced its decision. Washington is up live in seventy-five seconds. Every station
> on the network is taking it. Your hour is already built, so something has to give."*
> Take it live at 9:34 · Hold it for the next break · Skip it

**That is the most game-like thing in the React app and it fires exactly once.** In Phaser it should
be the rhythm.

## What carries over from the React build

**Everything except the drawing.** All eighteen `lib/` files and both API routes are plain
TypeScript with no React in them: the NPR wire, the day builder, Blob storage and its sweeps, the
recordings, weather, the legal ID, the scoring model, the rights rules, the hot-clock geometry, the
rules definitions, `landOn()`. Nineteen test files come with them. **The 5 a.m. cron does not change
at all.** A card is only a new way to draw a `WireItem` the engine already understands.

Six React components and four stylesheets are replaced.

## Two things that get harder, and must be built deliberately

**Accessibility resets to zero.** Canvas draws pixels — no buttons, no labels, no focus order,
nothing a screen reader can reach. The React build was careful throughout: colour never the only
signal, every disabled control explaining itself in text, a hidden running order beside the hot
clock. None of that is free in Phaser, and most games never do it.

**The audio gesture constraint follows you.** See the browser-audio section of `docs/roadmap.md`
before writing a line of audio code — especially that Web Audio lets you *verify* the grant
(`await ctx.resume()`, then assert `ctx.state === 'running'`) where the React path could only assume
it.

## Still open

- **How long is the morning?** Four hours of story time compressed into how much real play.
- **What happens at nine?** Do you hear the hour go out, or does it cut to the aircheck? The
  recordings are the best asset this project has; the answer decides whether they are the payoff or
  just a score input.
- **How many cards are on screen at once?** Twenty-six is a lot of canvas. Does the wire arrive in
  waves, or is it all there from 5 a.m.?
