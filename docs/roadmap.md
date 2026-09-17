# What's next

Four gaps found by using the thing, on the night of 2026-09-16, in the order they get built.
Each one came from a producer sitting in front of the app and hitting a wall — not from a review.

## 1. A player you can read

**The problem.** Four separate times in twenty minutes the app looked broken and was working:

| What it looked like | What it was |
|---|---|
| "Nothing is happening, no play, no audio" | The 60-second legal ID, silent by design |
| "Stuck at 3 of 30" | A 4:40 NPR newscast, halfway through |
| "4 of 30, no TTS" | A browser tab older than the recordings |
| "Only one underwriting spot" | A deliberate one-per-hour rule the button never mentions |

Three of those four are the same missing thing: **no elapsed time, no remaining time, no progress.**
A four-minute story and a frozen app are pixel-identical.

**Build:** elapsed and remaining, a progress bar, now-playing and up-next, skip forward and back,
and it stays visible while you scroll.

**Do not break:** playback must start inside the user's tap. See the comment above `unlock()` in
`lib/player.ts` — this was broken twice and costs every iPhone the entire session.

## 2. A legal ID and weather that actually say something

`lib/hour.ts:35` (legal ID, 60s) and `lib/hour.ts:18` (weather window, 45s) are placeholders. The
clock counts 105 seconds at the top of every hour and **there is nothing behind either one.**

- **Legal ID** — station-specific fixed text, recorded once per station and cached forever, since the
  wording almost never changes. Six recordings, one time.

  **Confirmed by the station, 2026-09-17 — use this exactly:**

  > You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee

  That is the home station (`s921`). The pattern is FCC-shaped: brand, then call sign, then city of
  licence. **The other five stations' wording is NOT confirmed** — WBEZ, WNYC, WABE, KQED and KCRW
  each need their own, and guessing a call sign or city of licence from general knowledge is exactly
  how this goes wrong on air. Ask for each; do not infer.
- **Weather** — real forecast per station city. Stations already carry `city` (`lib/day.ts:8`), so
  the location is mostly solved; "the Bay Area" needs coordinates. Source: `api.weather.gov` — free,
  no key, US-only, authoritative, and all six stations are US. Recorded in the 5 a.m. job. Six more
  recordings a morning, pennies.
- **The catch that shapes the script:** recorded at 5 a.m., aired at 9. That is a four-hour-old
  forecast. Fine for "high near 72, rain after lunch". **Wrong for "it's raining right now."** A
  confidently wrong weather read on a real station is worse than an empty window.
- **Traffic: don't.** There is no free authoritative traffic feed. Fake traffic is worse than silence.

## 3. Rules — how to play

Nothing tells a newcomer the goal, why "Put it on air" is greyed out until three blocks, what a hot
clock is, or what the five scores mean. Related: the topic picker offers ten choices where only five
do anything — the other five are inert and the difference is marked with an asterisk.

## 4. Drag to reorder

A rundown you can only append to is not a rundown. Today the only list operations are add-to-end and
delete (`removeFromHour`, `HourBuilder.tsx:132`).

**The wrinkle:** fixed blocks — legal ID, weather, traffic — are anchored to clock positions, not list
positions, and slide to where they belong as the hour fills. They should not look draggable. Only
the stories a producer added can move.

**Keyboard access is not optional.** Drag that only works with a mouse is a step backwards, and this
codebase has been careful about that throughout.

---

## Carried forward, unfinished

**Open this on a real iPhone before any morning depends on it.** Open a normal hour, tap Play **once**,
then do not touch the screen. The first block is the legal ID — silent by design — so hearing nothing
for ~60 seconds proves nothing either way. **Watch the button.** Success: it still reads "Pause" at the
end of that minute and tape rolls on its own. Failure: it flips back to "Play my hour" and no tape ever
rolls. **Do not tap twice** — a second tap is a fresh gesture and masks the exact failure being tested.

This is the one link in the audio path that is reasoning rather than observation.
