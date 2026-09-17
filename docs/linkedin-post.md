# LinkedIn post — Nine O'Clock Hour

Draft. Written 2026-09-17. Every number in it is checked against the code, not remembered.

---

## The post

**I built a game where you produce a real radio hour. With real news. That you can actually listen to.**

It's called Nine O'Clock Hour, and it started as a question I couldn't stop poking at: why does news discovery feel like a chore, when putting a radio hour together is one of the most engaging things I've ever done?

Here's how it works.

**At 5 a.m., a job wakes up and pulls the actual wire.** Not a sample file — the live feed that public radio stations use to move stories between newsrooms. This morning it brought back 26 stories from six newsrooms: 88Nine Radio Milwaukee, KCRW in Los Angeles, WBEZ in Chicago, WNYC in New York, WABE in Atlanta, and KQED in the Bay Area. Every story that arrived as text gets read aloud in a synthetic voice, so it has a way to air. Every story that arrived with tape keeps the newsroom's own audio, streamed from their servers, with a link back to them. Nothing is copied. That part isn't a feature — it's a promise the app makes in writing and keeps in code.

**Then you're the producer.** You've got an hour to fill and a hot clock to fill it against — the grid that says the newscast lands here, the station ID goes there, weather at nineteen past. You pick what runs, in what order. Time is the thing you spend: you can't listen to all 26 stories before nine, and neither can a real producer. What you *don't* get to hear matters as much as what you do. That constraint is the whole game.

**And the wire keeps moving while you work.** Something big lands at 7:40 and the hour you already built is suddenly wrong. Take it live, hold it for the next break, or pass. Every station in the network is carrying it. What do you do?

## How it connects to real radio

This runs on NPR's Content Distribution Service — the pipe member stations actually publish and read each other's work through.

To get at it, I built and published an MCP server for that wire.

**In plain terms:** think of it as a satellite downlink. Before, every application that wanted the network feed had to run its own private line and learn NPR's plumbing from scratch. An MCP server is a standard dish and receiver — one common way for an AI assistant, or an app, to tune into a source of information and actually understand what's coming down. Point it at the feed and it can ask real questions: what did Chicago file this morning, what's still current, what has audio.

NPR documents this API in prose but never published a machine-readable description of it. So our team wrote one — 63 content types, 19 shared schemas — and open-sourced it, so the next station doesn't have to repeat the work.

## The part I care most about: it's a real news product

The hour you build isn't a scored attempt that gets thrown away. **It's a news hour you can put on for the commute.** You can play the whole thing, start to finish, and scrub to any point — drag to 9:19 and you land on the weather, because 9:19 *is* the weather.

That inverts the usual thing. You don't consume the news and then get quizzed. You go *looking* through 26 stories from six cities, decide what a listener needs to hear at nine in the morning, and then hear the result. You end up more informed because you had to make calls about what mattered — which is a very different kind of attention than scrolling.

## Then you get an aircheck

In radio, an aircheck is the recording of your hour you listen back to afterward. That's where you actually learn. So the game gives you one.

Five scores, and they're the things a program director would say out loud:

- **Clock** — did the hour land on time. Run long and it's zero. At ten the network joins whether you're finished or not; that's the one you can't talk your way out of.
- **On air** — how you handled the big moments. The breaking bulletin. Clearing the underwriting credit.
- **Freshness** — how current what you aired actually was.
- **Mix** — local, network, and music in proportion. Fewer than two local stories and you built an hour someone in Milwaukee could have heard anywhere.
- **Hold** — a modeled listening curve, minute by minute, and where it bottomed out. Run three heavy stories back to back and you can watch the audience reach for the dial. After three hard ones, people are owed an exit ramp — music, something local, something human.

And the honest part: **a low score still has to sound good.** Some mornings you want forty minutes of music and three stories. The gap between the hour you'd personally listen to and the hour that serves an audience — that gap *is* the job. A real producer lives in it every day. The game lets you sit wherever you like in it and tells you honestly where you sat. It should never refuse to build the hour you want.

Still building. But it's the most fun I've had making something in a long time.

#PublicRadio #AI #ProductManagement #NewsInnovation #MCP

---

## Notes for Tarik before posting

- **The MCP nuance.** The post says you built an MCP server for NPR's wire and that the game runs on that same feed. Both true. What it does *not* say — and what isn't true — is that the game calls the MCP server at runtime. It queries CDS directly (`lib/cds.ts`); there's no MCP reference in this repo. If you want the stronger claim, the game would need to actually route through it.
- **No live link on purpose.** This has never been deployed and has no public URL. The post says "still building" rather than inviting anyone to try it. If you'd rather have a link, that's a deploy decision.
- **Numbers are from this morning's real run:** 26 items, six newsrooms, 2026-09-17. The six station names are from `lib/day.ts`. The five score names and what each measures are from `lib/hour.ts`.
- **Length** is ~700 words, long for LinkedIn. If you want a tighter cut, the three sections that survive on their own are the 5 a.m. open, the aircheck, and the "low score still has to sound good" close.
