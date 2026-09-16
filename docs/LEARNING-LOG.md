# Learning log

Dated entries. Each answers three things: what we expected, what happened, what we now believe.
Written for someone who was not here.

---

## 2026-09-16 — A green test suite is evidence about the test doubles, not about the world

**What we expected.** 96 passing tests, three independent code reviews and a clean typecheck
meant the morning job worked. It had never been run end to end, but everything that could be
checked had been checked.

**What happened.** An agent ran the real job against real infrastructure — without asking,
which was its own problem — and it returned HTTP 500. The job writes the day's file twice:
once early so a crash leaves an honest record, once at the end with the audio attached. Vercel
Blob refuses a second write to the same name unless you pass `allowOverwrite`. So the job
failed at the finish line **every single time**, after paying to voice two dozen news reads.

Nothing caught it because the tests used a stand-in for storage that accepted repeated writes
happily. Worse: the function at the centre of it had no test seam at all, so no test had ever
exercised it. Three reviews looked at code that was never run.

**What we now believe.** A passing suite proves the code satisfies the doubles. If a double is
more permissive than the real service, the suite proves nothing about production. So: **make
fakes refuse what the real thing refuses.** When the fix landed it included tightening the
double to reject a repeat write — which made every existing test stricter for free.

Corollary, learned the same day: the only test nobody had run was the one that mattered. Run
the real thing once, deliberately, before trusting anything built on top of it.

---

## 2026-09-16 — Structural checks answer "present and consistent", never "legible"

**What we expected.** The hot clock — a ring diagram of the hour — was verified from both
sides. The implementer checked the DOM: the SVG present, correctly hidden from screen readers,
the visually-hidden list using the clip technique rather than `display: none`, no horizontal
scroll at 390px. The reviewer read the diff and confirmed the label logic was internally
coherent. Both passed.

**What happened.** Someone took a screenshot and looked at it. The labels inside the wedges
were overlapping smudges. Measuring: a four-minute story gets ~46px of arc against a
76-character headline. Then the reviewer found the factor the measurements had missed — the
drawing is 320 units displayed at 200 CSS pixels, a 0.625× shrink, and **everything inside an
SVG scales with it, including the font size.** `fontSize={9}` renders at **5.6 pixels**.

That single number changed the remedy. The obvious fix — truncate the text to fit — would have
left twelve unreadable characters where seventy-six were, because the binding constraint was
type size, not string length.

**What we now believe.** Every check we had ran on structure, and structure was fine. "The text
is present and positioned" and "the text is legible" are different claims, and no DOM
assertion, source reading or passing test can bridge them. **For anything visual, look at it.**
Take the screenshot, at the real rendered size.

Both reviewers named this independently, from opposite sides — one had confirmed coherence
without asking what it would measure; the other had confirmed presence without asking whether
it could be read. The blind spot is symmetric, which is why it survived both.

---

## 2026-09-16 — Correlation is a lead, not a finding

**What we expected.** A day file appeared in storage at 17:18:00. An implementer's commit
landed at 17:18:03. Three seconds apart, same machine, same project.

**What happened.** That agent was told it had run the job. It pushed back — laid out its
complete command history, and pointed out that a commit timestamp records when `git commit`
ran and nothing about what else was happening on the machine. It was right. A different agent
had done it, for a reason written into its own brief.

**What we now believe.** An agent that accepts a plausible false finding to keep the peace
makes the whole record untrustworthy. The pushback was worth more than agreement. And the
cheap route to certainty — ask both, wait — was available the whole time; a confident wrong
answer was chosen over a slower true one.

Related, from the same day: a brief that says "check against a real day" while a standing rule
says "ask before spending" is a contradiction the agent in front of it will resolve by
following the instruction. **Write the constraint into the instruction, not only into the
rules.**
