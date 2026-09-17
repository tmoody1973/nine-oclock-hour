# 002 — The weather window airs a real forecast, in the forecaster's own words

**Decision.** The 19:00 weather window airs our own recording of the National Weather Service's
forecast for each station's city, composed from the service's own fields and sent straight to
text-to-speech with no model allowed to reword it. It is stored under a third prefix, `wx/`, and
a station whose forecast fails keeps a silent window rather than anything invented.

## Why this came up

The hour reserves 45 seconds for weather, every hour, at 19 minutes past. There was nothing
behind it — no forecast, no audio, no text. Together with the silent legal ID (decision 001) that
was most of two minutes of nothing in the first twenty minutes of every hour.

Two things were at stake, and they pull in opposite directions. The first is that a weather read
is the most checkable thing a radio station says: the listener is looking out of the window while
it plays. The second is timing — this app records at 5 a.m. and airs at 9. Every word is four
hours old by the time anybody hears it.

A third thing turned up once the code was open, and it changed the shape of the work: the weather
window was not merely silent in the player, it was **absent** from it. The windows are inserted by
the layout walk, which feeds the rail, the on-screen clock and the score — but the player was
handed the producer's own list of blocks, which never contained them. The hour that played was
ninety seconds shorter than the hour the rundown beside it promised.

## Options

1. **Have a model write the weather read**, the way every news read in this app is written — hand
   it the forecast and ask for something that sounds natural on air.
   *Real cost:* a model asked to make weather sound natural reaches for "it's pouring out there
   right now", and at nine o'clock that is a confident lie about something the listener can check
   by turning their head. A forecast that has been creatively improved is a forecast that is
   wrong.
2. **Read current conditions** — temperature and sky right now — which is what most weather
   widgets show.
   *Real cost:* recorded at five, aired at nine. It describes a morning that is over.
3. **Compose the sentence ourselves from the forecast periods the service returns**, verbatim,
   and speak only in forecast.
   *Real cost:* it sounds like a government forecast rather than a broadcaster, because it is one.
   Less warmth, no local colour, no "grab a jacket".

## What we chose and why

Option 3, and the constraint turned out to be a gift. `api.weather.gov` does not return "the
weather" — it returns named future *periods* ("Thursday", "Thursday Night"), each with a
`detailedForecast` the forecaster has already written in broadcast prose: *"A chance of rain
showers before noon. Mostly cloudy, with a high near 71. Northeast wind 5 to 10 mph."* Using it
word for word makes the honest version also the easy version, and there is no prompt anywhere on
this path for anyone to later "improve". The read leads on the next **daytime** period, because at
5 a.m. the first entry is an overnight that is over before the hour airs.

The source is also what settles the rights question, which is the same question the legal ID
raised: this is a work of the United States government, so the forecast is public domain and our
recording of it is ours to air. The gate in `lib/playlist.ts` that stops the app broadcasting
another newsroom's tape is satisfied honestly rather than loosened — a window is marked as "our
own voice" only where a recording actually exists.

Two station coordinates needed a judgement call. KCRW is labelled "Los Angeles" in the app but the
station sits in Santa Monica, and coastal and inland Los Angeles genuinely differ — a summer
marine layer is a real fifteen degrees. The coordinates moved **inland** to downtown Los Angeles,
so the forecast describes the city the producer's screen names; the alternative was to relabel the
station and disagree with how KCRW describes itself. KQED's city is "the Bay Area", which no
weather service can look up, and San Francisco is the resolution. The team lead set the rule — the
read describes the place the screen names — and Claude chose the coordinates that make it true.

For the structural half, Claude proposed and the team lead's brief invited two shapes: convert
**every** fixed window into a real block on the way to the player, or splice in the weather window
alone. We took the first. Weather-only would have fixed the window named in the brief and left the
traffic window still missing, and left the player still playing a shorter hour than the rail shows.

Storage is a third prefix on purpose. Daily reads live under `reads/` and are swept after three
days; the legal ID lives under `ids/` and is never swept, because an identification is permanent.
Weather is neither: it is referenced from a station record, which the sweep's bookkeeping cannot
see (so under `reads/` it would vanish on the fourth morning, invisibly), but it is stale within
hours, so it must not be treated as permanent either.

## What we gave up

The read sounds like the National Weather Service, because it is the National Weather Service. No
personality, no "you'll want an umbrella", no tie-in to the story that just ran. A station that
wants a voice in its weather will have to write one, and at that point somebody has to own the
question this decision dodges: who is accountable when a human-sounding forecast is wrong.

Nothing sweeps `wx/` today. Six stations, one recording each per morning, roughly 1.4 MB apiece:
about 8 MB a day, 3 GB a year, growing forever. That is a real bill, deliberately not paid for
now, and the fix is small — nothing under that prefix older than yesterday can ever be worth
keeping, so a plain age check is the whole job, with none of the reference-tracking `reads/`
needs.

Adding every window to the player also means the traffic window now airs 45 seconds of honest
silence where it previously aired nothing at all, and a pledge-week hour gains four minutes of it.
The played hour is longer than it was — because it is finally the right length.

## How we'll know if this was right

- No forecast in the app ever describes conditions in the present tense. The test suite fails if
  one does.
- The spoken read stays inside 45 seconds. Measured once against the real model: 60 words ran 26.4
  seconds, and the word budget is set from that rate rather than from a guess.
- The played hour and the rail agree on *which blocks* run and in what order. They do NOT yet
  agree on length: a window holding a recording advances when the audio ends, not when its
  scheduled time is up, so a 26-second forecast in a 45-second window finishes 19 seconds early
  and the hour clock jumps forward. The legal ID already does the same — a 6-second
  identification in a 60-second block. Whether a fixed block should hold its full scheduled
  length is a product decision about whether the app plays real time or compressed time, and
  it is open.
- A morning when weather.gov is down produces a silent window and a `wx:<station>` marker, never a
  stale or invented forecast.

## What actually happened

<!-- Tarik fills this in. -->
