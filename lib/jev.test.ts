import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_CONFIDENCE, SUBJECT_DESKS, fileStory, isLocal, stateFor, trust } from './jev';
import type { Topic, WireItem } from './types';

const item = (extra: Partial<WireItem> = {}): WireItem => ({
  id: 'x', src: 'WNYC', how: 'ours', kind: 'seg', title: 'South Bronx Legionnaires outbreak death toll rises to 2',
  teaser: 'Health officials confirmed a second death.', url: '', topic: 'local' as Topic,
  when: 'this morning', len: 220, ...extra,
});

const reply = (body: unknown, ok = true, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status: ok ? status : status })) as unknown as typeof fetch;

// `local` is NOT one of the options, and that is the whole design. Offering it alongside the
// subject desks made the model torn on exactly the stories that are both — an SF Opera strike
// is music AND local — and the same wire produced 17 disagreements instead of 7.
test('local is never offered as a desk; it is asked separately', () => {
  assert.ok(!SUBJECT_DESKS.includes('local'), 'local is still being offered as a subject desk');
  assert.ok(SUBJECT_DESKS.includes('music') && SUBJECT_DESKS.includes('health'));
});

test('the story handed over is the three things a producer glances at', () => {
  const s = stateFor(item());
  assert.match(s, /HEADLINE: South Bronx/);
  assert.match(s, /SUMMARY: Health officials/);
  assert.match(s, /FILED BY: WNYC/);
});

test('a confident judgment comes back as a subject and a localness', async () => {
  const j = await fileStory(item(), 'k', reply({
    answers: { desk: { choice: 'health', confidence: 0.99 }, isLocal: { value: 0.9 } },
  }));
  assert.deepEqual(j, { topic: 'health', confidence: 0.99, localP: 0.9 });
  assert.equal(trust(j), true);
  assert.equal(isLocal(j), true);
});

// Below the threshold the rule we already had is worth more than a guess. The number came from
// the spike: every disagreement at or above 0.75 was a real misfiling, everything under it was
// a toss-up between two defensible desks.
test('an unsure judgment is not trusted over the rule we already had', async () => {
  const j = await fileStory(item(), 'k', reply({
    answers: { desk: { choice: 'news', confidence: 0.55 }, isLocal: { value: 0.84 } },
  }));
  assert.equal(trust(j), false);
  assert.ok(j.confidence < MIN_CONFIDENCE);
});

test('a national story is judged not local', async () => {
  const j = await fileStory(item(), 'k', reply({
    answers: { desk: { choice: 'politics', confidence: 1 }, isLocal: { value: 0.08 } },
  }));
  assert.equal(isLocal(j), false);
});

// A missing localness must never invent a local flag. Absent is "not local", not "probably".
test('a missing localness answer reads as not local rather than being guessed', async () => {
  const j = await fileStory(item(), 'k', reply({ answers: { desk: { choice: 'health', confidence: 0.9 } } }));
  assert.equal(j.localP, 0);
  assert.equal(isLocal(j), false);
});

// The caller decides what a failure means — in the cron it means keeping the regex answer and
// recording it in `degraded`. Returning a fallback here would hide that from the morning.
test('a refused call throws rather than quietly returning a desk', async () => {
  await assert.rejects(() => fileStory(item(), 'k', reply({ detail: 'nope' }, false, 401)), /typesafe 401/);
});

test('a desk outside our own list is refused, not written into the day', async () => {
  await assert.rejects(
    () => fileStory(item(), 'k', reply({ answers: { desk: { choice: 'sports', confidence: 1 } } })),
    /no usable desk/,
  );
});

test('a reply with no answers at all is refused', async () => {
  await assert.rejects(() => fileStory(item(), 'k', reply({ ok: true })), /no usable desk/);
});
