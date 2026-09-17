# 004 — A block with nothing to play does not air

**Decision.** When a block has no audio of its own, the player does not wait out its slot on
the clock. It moves straight on to the next thing it can actually play. The played hour is
therefore shorter — sometimes much shorter — than the rundown sitting beside it.

## Why this came up

Several kinds of block carry no audio file: a legal ID at a station that has not confirmed its
wording, a weather window whose recording failed, a traffic window nobody voiced, and every
music bed. Until now the player held each of those for its full scheduled length on a timer.

On a normal morning that is the first minute of the hour spent on a silent legal ID, then a
45-second silent weather window, then a 45-second silent traffic window. Two and a half
minutes of nothing before the first word is heard. The screen said so — *"Nothing to play —
this block airs on the clock"* — but saying it is not the same as being listenable.

The product owner is a working radio professional. He was asked directly: when a block's audio
is shorter than its slot on the clock, should the player wait out the rest of the slot or skip
ahead? What was at stake is which artefact the player is a rehearsal of: the hour as planned,
or the hour as heard.

## Options

**Wait out the slot (what it did).** The player is a faithful rehearsal of the clock: the block
occupies exactly the time the rundown gave it, so the timings on screen and the timings in the
hour agree. The cost is dead air, on real listening time, in the first thing anyone hears.

**Skip ahead, play only the audio.** No dead air at all. The cost is that the played hour and
the rundown beside it no longer agree on the wall clock, so the player is no longer a rehearsal
of the clock — it is a rehearsal of the audio.

**Shorten the slot to the audio's real length.** Splits the difference by rewriting the rundown
to match what exists. Rejected before it was offered: it would change what the scorer sees,
and the scorer judges the hour the producer *planned*, which is the thing being taught.

## What we chose and why

Skip ahead. The call was the product owner's, made on the direct question. His reasoning is
the professional one: dead air is the failure a radio producer is trained to eliminate, and a
rehearsal that makes you sit through two and a half minutes of it is teaching the wrong reflex.

Scoring is untouched. `score()` reads the rundown, not the playback, so the array it is handed
is byte-identical to what it was before — pinned by a test in `lib/wire.test.ts`.

## What we gave up

The player and the rundown now disagree, and nothing on screen reconciles them. The hour
readout ("6:10 into the hour") is a position in the *rundown*, so it jumps forward when silence
is skipped, and a listener who has heard forty seconds of audio can be told they are six
minutes into the hour. That is honest about the clock and misleading about the experience, and
we did not fix it.

We also lost the one thing the old behaviour did well: it showed a producer, in real time, how
much of their hour was silence. That is now invisible unless they read the rundown.

## The part that could have cost real money

The obvious way to build this — make the silent block's timer fire immediately — quietly
breaks audio on every iPhone. The first tap is the only moment iOS will let audio start, and
when the hour opens on a silent block that tap is spent playing five milliseconds of silence
purely to win that permission. Skipping instantly replaces the audio source moments later,
racing the one call the whole session depends on. It was tried, the tests stayed green, and
playback broke.

So the skip is not expressed as a faster timer. The tap itself lands on the first block that
*has* audio, and plays that. The permission is won by a real recording rather than by silence,
nothing interrupts it, and there is no race to lose — the same path a station with a recorded
legal ID has always taken.

## How we'll know if this was right

The first audible thing in the hour starts within a second of the tap, on a phone as well as a
desktop, on a station with no confirmed legal ID wording. And the producer does not have to be
told why the player looks stuck, which is the question that prompted all of this.

## What actually happened

_(Tarik fills this in.)_
