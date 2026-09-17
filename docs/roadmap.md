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

`lib/hour.ts:18` (weather window, 45s) is still a placeholder. The legal ID is **built for the home
station** (2026-09-17) and still silent for the other five, because nobody has given us their words.

- **Legal ID — DONE for `s921`, blocked on words for the other five.** The confirmed wording lives in
  `lib/legalid.ts`, the 5 a.m. job records it with text-to-speech only (`voiceId`, never the script
  model — a legal ID airs verbatim), and it is cached on a hash of the words rather than the date, so
  it is recorded once and free every morning after. Stored under `ids/`, which the three-day read
  sweep never touches.

  **Confirmed by the station, 2026-09-17 — this is what airs:**

  > You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee

  **The other five stations' wording is still NOT confirmed** — WBEZ, WNYC, WABE, KQED and KCRW each
  need their own, and guessing a call sign or city of licence from general knowledge is exactly how
  this goes wrong on air. Ask for each; do not infer. Until then their hour opens on a silent block
  labelled "Legal ID (no wording on file)", which is honest rather than broken.
  Adding a station is one line in `lib/legalid.ts`; a test goes red if one appears without words.

  **Still unheard by a human:** nobody has listened to the recording, so how the voice says the call
  sign ("W-Y-M-S" letter by letter, or "wims" as a word) is unverified.
- **Weather** — real forecast per station city. Stations already carry `city` (`lib/day.ts:8`), so
  the location is mostly solved; "the Bay Area" needs coordinates. Recorded in the 5 a.m. job. Six
  more recordings a morning, pennies.

  **Source verified live on 2026-09-17, not read from docs.** `api.weather.gov` answered HTTP 200
  with **no key and no registration**. Three facts that will otherwise cost an implementer an hour:

  1. **It is a two-step lookup.** `GET /points/{lat},{lon}` returns `properties.forecast`, a
     gridpoint URL; fetch *that* for the actual forecast. Milwaukee (43.0389, -87.9065) resolved to
     `gridpoints/MKX/88,65/forecast`.
  2. **A User-Agent header is required** — it is the weather service's stated policy, and requests
     without one are refused. Send something identifying, e.g.
     `NineOClockHour/0.1 (radio rundown; contact address)`.
  3. **Stations need coordinates, not city names.** The endpoint takes lat/lon only. Six pairs in
     the station table; "the Bay Area" has no coordinates of its own and needs a real point.

  **The response shape pushes toward the honest script, which is the good news.** It returns named
  forecast *periods* — "Tonight", "Thursday", "Thursday Night" — each with `temperature`,
  `shortForecast` and a full `detailedForecast` already written in broadcast-ready prose
  ("A chance of rain showers after 2am. Cloudy, with a low around 62. Chance of precipitation is
  40%."). Periods, not current conditions — so a script built from them is still true four hours
  after it was recorded, which is exactly the constraint below.
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

---

## Open decisions — for Tarik, not for an implementer

**1. Does a fixed block hold its full scheduled length?** A block with audio ends when the audio
ends, not when its slot is up. A 26-second forecast sits in a 45-second window; a 6-second legal ID
sits in a 60-second block. So the played hour runs shorter than the rundown beside it. Holding the
full length is more honest about the clock and adds silence a host would fill live; advancing early
is shorter and jumps the hour counter forward. **Real time or compressed time — the answer decides
both this and the traffic question below.**

**2. Traffic's 45 seconds of labelled silence.** The player now airs every window the rundown
promises, so traffic reads "Nothing to play — this block airs on the clock" for 45 seconds, and a
pledge hour gains about four minutes across separate labelled pitch breaks. That is the hour finally
being its true length. Reverting is a one-line filter in `airBlocks`.

**3. Does the recorded legal ID say the call sign correctly?** "W-Y-M-S" or "wims"? No test can
reach this. If it is wrong the fix is spelling it phonetically in `lib/legalid.ts`.

**4. Does the weather read sound like broadcast copy?** The script leads each period with its bare
name — "Thursday." then "Thursday Night." — and keeps the wind detail. Both are the National Weather
Service's own words, used verbatim on purpose, but verbatim is not the same as sayable.

## Known gaps, deliberately not fixed

- **The six TTS calls in the morning job are unbounded.** `speak()` (`lib/reads.ts`) passes no
  `AbortSignal`, so a stalled Gemini response has no ceiling. Shares the path with the ~26 story
  reads, so it is pre-existing rather than new. The weather fetch was bounded at 8s
  (`lib/weather.ts`, modelled on `lib/cds.ts`) because it was the one that could cost the whole day;
  this one costs the reads and the final write. Same shape of fix, not yet applied.
- **Nothing sweeps `ids/` or `wx/`.** Legal IDs are permanent by design, so orphaning a superseded
  one is the accepted cost (see decision 001). Weather is not permanent: six files a day, ~1.4 MB
  each, roughly 3 GB a year, and nothing deletes them. A plain age check is the fix (decision 002).
- **Nobody has opened this on an iPhone.** Still the one link in the audio path that is reasoning
  rather than observation. The check is written beside `unlock()` in `lib/player.ts`.
- **Nobody has heard a weather read inside the app.** One was produced outside it, through the real
  code and the real voice, and sent to Tarik.
