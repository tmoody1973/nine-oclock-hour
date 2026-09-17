# 003 — The topic picker only offers picks that can change something

**Decision.** The "who is listening" picker now shows only the five subjects that can actually
move a score. The other five are named in a sentence underneath, with the reason they are not
on offer.

## Why this came up

The picker offered ten subjects and said *"Pick up to three topics you care about — starred
ones change your score"*, marking five of them with an asterisk.

Only the five starred ones did anything. The scoring engine keeps a per-subject cost for how
fast a listener gets tired — a weight — and it looks that cost up **only on heavy stories**.
Heavy means news, politics, world, economy or health. Tech, culture, climate, local and music
can never be heavy, so their weights were recorded and never read.

The product owner picked health, tech and culture. Only health did anything. The interface let
him spend two of his three picks on choices that provably do nothing, and signalled the
difference with a piece of punctuation. What was at stake is the credibility of the whole
scoreboard: a producer who learns that one control lies has no reason to trust the other five
numbers it hands back.

## Options

1. **Fix the scoring so all ten count.** Make every subject able to cost a listener something.
   *Real cost:* it changes every score in the product. Every aircheck recorded so far stops
   being comparable with every aircheck recorded after, and the tuning behind the heavy/light
   split — three hard stories in a row is where people reach for the dial — is real editorial
   judgement, not an oversight to code around.
2. **Keep all ten and disable the five that cannot count, each with a reason.**
   *Real cost:* five dead controls on screen, each needing its own explanation. The page already
   had a complaint filed against exactly this shape — a button that looks like a button and
   does nothing when you press it.
3. **Show only the five that count, and say where the others went.**
   *Real cost:* a producer who cares about the music desk has nowhere to say so, and has to
   accept a sentence explaining why rather than a control.

## What we chose and why

Option 3. The call was the team lead's in the task brief — *"fix the interface, not the model"*,
and *"a producer must not be able to waste a pick without being told"* — and Claude chose which
of the three interface fixes to build.

Removing the control beats disabling it. A disabled button still has to be explained, and five
of them is five explanations; with the affordance gone, wasting a pick is not discouraged, it is
impossible. The five absent desks are listed by name in the sentence underneath, so nobody is
left wondering where music went.

The list of which subjects count is no longer written down twice. `countsForScore()`
(`lib/rules.ts`) asks the engine's own list, and a test goes red if the engine's answer and the
picker's offer ever come apart.

## What we gave up

A producer cannot express a preference for music, culture, climate, tech or local, and the app
now openly admits that the audience model does not care about those subjects. That is a real
narrowing of the fiction: a radio listener plainly does have taste in music, and this build
cannot hear it. We chose an honest small control over a dishonest large one, but the honest one
is smaller.

We also accepted that the sentence explaining the absence is the only place a newcomer learns
the shape of the model. If somebody later removes that paragraph as clutter, the picker goes
back to looking arbitrary.

## How we'll know if this was right

- Nobody asks again why a pick did not change their score.
- If the scoring engine's heavy list ever changes, `lib/rules.test.ts` goes red before the
  picker can start offering — or hiding — the wrong subjects.
- The number of picks a producer makes per hour goes up rather than down: three cheap choices
  became three that matter.

## What actually happened

<!-- Tarik fills this in. -->
