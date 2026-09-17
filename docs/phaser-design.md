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

## Nine o'clock: the player chooses how long to listen

**Tarik's call.** At nine the hour goes out, and you pick how much of it you sit through — **the
whole thing, or a compressed version**. Either way the aircheck follows.

That is the same rule as the preview cost, which makes it a principle rather than two settings:
**the player decides how much real time this costs them, and the honest option is always available.**

### What "compressed" should be — play the joins

Proposed, not yet agreed: compressed does not mean sped up. It means **the first eight to ten
seconds of every block, in order**. You hear the legal ID land, the newscast come in under it, the
read, the music bed arriving. Around ten blocks makes roughly ninety seconds.

Two reasons:

1. **That is what an aircheck actually is.** In radio an aircheck is the recording of your hour that
   you listen back to afterwards. The scorecard already carries the name; this makes the name true.
2. **The craft is in the joins.** Nobody reviews their own hour for the middles. They listen to how
   one thing became another — whether the newscast landed clean, whether the music came in too hot.

The full version stays for anyone who wants it, and for a music station it is genuinely listenable:
lofi beds, voiced reads, a real forecast. Note that with silence skipped it is already shorter than
sixty minutes.

## It has to work as a news product, not only as a game

**Tarik, 2026-09-17:** *"the game should also be allowed the user to get the news they want to hear
too in addition to engaging gameplay."*

This is a constraint on everything above, not a feature beside it. **The hour you build is a real
thing you want in your ears** — something you would put on for the commute — and the game is the
interface for curating it. Not a scored attempt that gets thrown away.

### What that changes

**The full hour is the product; the compressed version is the feedback.** Earlier this document had
that backwards — full playback treated as a curiosity for completists, compressed as the sensible
default. Invert it. If the point is genuinely to hear the news, you listen to the whole thing and
skim the joins only to see how you did.

**The topic picks stop being scoring weights dressed as preferences.** They become literally "what
do I want to hear this morning", and the score becomes a second opinion rather than the purpose.

**The wire is already a real news product.** Twenty-six items every morning from six newsrooms,
every text story voiced, a real forecast, the station's own identification. That is not set dressing
for a game — it is a news hour that happens to be assembled by playing.

### The tension is the design, not a problem to remove

The aircheck rewards good radio: land on the top of the hour, clear the underwriting credit, air the
current newscast, keep a mix, never three heavy stories back to back. **Some mornings you want forty
minutes of music and three stories.**

That gap — between the hour you would personally listen to and the hour that serves an audience —
**is the job.** A real producer lives in it every day. The game should let you sit wherever you like
in that gap and tell you honestly where you sat. It should never refuse to build the hour you want.

### Consequences to design for

- **A low score must still produce a good listen.** If the scoring and the listening fight, the
  scoring loses — it is feedback, not a gate.
- **The hour should be worth keeping.** Somewhere between "play again tomorrow" and "this is my
  morning show": resumable, maybe portable. Not decided.
- **Reads have to be genuinely listenable**, because people will actually listen to them end to end
  rather than previewing fifteen seconds. That raises the bar on the voice and the script.

## The hour player: whole hour, and scrub anywhere

**Tarik, 2026-09-17:** *"player should be able to listen to whole hour, scrub the player to move and
listen to any point."*

So it is a podcast player, not a block sequencer. That follows from the hour being a news product: if
people listen to it properly they will expect to move around in it.

### Scrub along the RUNDOWN clock, not along the audio

**The decision, and it collides with skipping silence.** The hot clock shows 9:00 to 9:59. Silence
does not air, so the audio is shorter than the hour. Drag to the middle of the bar and you might mean
*9:30* or *halfway through what actually plays* — different places.

**Scrub the rundown clock.** It is the hour on screen, it is what the scoring talks about, and it is
what a producer means when they say "the weather's at nineteen past". Drag to 9:19 and you land on
the weather, because 9:19 **is** the weather.

### The mapping, which is pure logic and belongs in `lib/`

Beside `landOn()` in `lib/player.ts`, testable without rendering, and it survives the rewrite:

> **clock position → which block, and how far into it**
>
> 1. Find the block whose scheduled span contains that position (`at <= t < at + len`).
> 2. Offset within it is `t - at`.
> 3. **If the block's real audio is shorter than its slot** — a 26-second forecast in a 45-second
>    window, a 6-second legal ID in a 60-second block — and the offset lands past the end of the
>    audio, carry forward to the next block that has sound. Same rule `landOn()` already applies.
> 4. If the block has no audio at all, carry forward likewise.

**The clock stays the truth and the audio follows it.** That keeps one number on screen meaning one
thing, which the React build learned the hard way: the hour readout that jumped forward whenever a
recording ended early was the same class of lie.

### Consequences

- **Position must be expressible both ways** — clock time for the display and the scrub bar, played
  time for whatever is actually feeding the speakers. The React player already kept two clocks for
  the same reason; keep the distinction explicit rather than letting one masquerade as the other.
- **Scrubbing into a silent stretch cannot strand the player.** Dragging into the middle of a traffic
  window should land on the next thing with sound, not stop.
- **The first scrub is still a gesture.** Whatever starts audio must start inside the tap — see the
  browser-audio section of `docs/roadmap.md`. A scrub that resumes playback counts.

## Still open

- **How long is the morning?** Four hours of story time compressed into how much real play.
- **How many cards are on screen at once?** Twenty-six is a lot of canvas. Does the wire arrive in
  waves, or is it all there from 5 a.m.?
