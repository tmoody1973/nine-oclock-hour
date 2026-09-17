# 001 — The legal ID speaks only words a station actually gave us

**Decision.** The hour's opening block airs a recording of each station's own legal
identification, but only for stations whose exact wording someone confirmed — one of six today —
and that recording is stored under its own permanent prefix rather than with the daily reads.

## Why this came up

Every hour opens with a 60-second block labelled "Legal ID and promo", and it was silent. The
product owner pressed play, got a minute of nothing, and reported the app as broken. The block
was one shared constant for all six stations, so it could not say anyone's call letters.

What was at stake if we got it wrong is unusual for this build. A station identification is not
editorial copy — it is a regulatory obligation. The FCC requires the call sign and the city of
licence, and it airs verbatim. Every other read in this app is deliberately rewritten in its own
words by a model; doing that to a legal ID, or guessing a call sign, is a licence problem
broadcast on somebody else's licence, not a bug.

## Options

1. **Derive each station's wording from the data we already have** — the station table carries a
   name and a city, so "You're listening to WBEZ, Chicago" writes itself six times over.
   *Real cost:* it is wrong. That table lists KQED's city as "the Bay Area", which is not a city
   of licence at all, and it holds no call signs — those would come from general knowledge, which
   is precisely how a legal identification goes wrong on air.
2. **Ship only the one confirmed station, leave the rest silent.**
   *Real cost:* five of six stations still open on a minute of nothing, and the feature looks
   half-finished until somebody chases five newsrooms for a sentence each.
3. **Wait until all six confirm, then ship all six at once.**
   *Real cost:* the home station keeps its broken-looking opening indefinitely, blocked on five
   emails nobody has sent.

## What we chose and why

Option 2, with the silence made honest: a station with no confirmed wording shows the block as
"Legal ID — no wording on file for this station", so a producer can see the silence is missing
words rather than a dead player. The call was the team lead's, set out in the task brief and in
`docs/roadmap.md`; Claude implemented it and added the test that goes red if a station ever
appears in the wording map without confirmed words.

A second decision rides along, and it is the one most likely to bite later. The recording is
stored under a prefix of its own, `ids/`, rather than with the daily reads under `reads/`. The
morning job sweeps `reads/` — it deletes anything older than three days that no stored day file
still points at — and it works out what is still pointed at by looking at the *stories* in each
day file. A legal ID is pointed at from the *station* record instead, so nothing would ever have
named it: under `reads/` it would have been deleted on the fourth morning, and the silence would
have come back days later with nothing in any log to explain it. The alternative was to teach the
sweep about station records, which is more code in the one function in this build that deletes
things. The separate prefix is also just true — a legal ID is permanent, not one of today's reads.

## What we gave up

Five of six stations still open on silence, and the product does not look finished until somebody
does the unglamorous work of asking each newsroom for one sentence. We also accepted that the map
of confirmed wording is edited by hand: there is no admin screen, and adding a station means a
code change and a deploy.

## How we'll know if this was right

- A station's legal ID is still playing a week after it was first recorded — which is the specific
  failure the separate prefix exists to prevent, and it only shows up on day four or later.
- The recording is made once and never paid for again: the morning job's cost does not move when
  the legal ID is added, because it is cached on the words rather than on the date.
- No station ever airs wording that nobody confirmed.

## What actually happened

<!-- Tarik fills this in. -->
