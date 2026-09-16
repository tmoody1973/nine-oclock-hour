import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStale, isOldRead, sweepReads, type StoreBlobDeps } from './store';
import type { DayFile, WireItem } from './types';

test('the file just written is never stale', () => {
  assert.equal(isStale(new Date()), false);
});

test('a file past the retention window is stale', () => {
  assert.equal(isStale(new Date(Date.now() - 8 * 864e5)), true);
});

test('the boundary is exactly seven days', () => {
  const now = Date.now();
  assert.equal(isStale(new Date(now - 6.99 * 864e5), now), false);
  assert.equal(isStale(new Date(now - 7.01 * 864e5), now), true);
});

test('a malformed timestamp is kept, never deleted', () => {
  assert.equal(isStale(new Date('nonsense')), false);
});

test('a read just voiced is never old', () => {
  assert.equal(isOldRead(new Date()), false);
});

test('a read past the 3-day retention window is old', () => {
  assert.equal(isOldRead(new Date(Date.now() - 4 * 864e5)), true);
});

test('the read boundary is exactly three days, not seven', () => {
  const now = Date.now();
  assert.equal(isOldRead(new Date(now - 2.99 * 864e5), now), false);
  assert.equal(isOldRead(new Date(now - 3.01 * 864e5), now), true);
});

test('a malformed read timestamp is kept, never deleted', () => {
  assert.equal(isOldRead(new Date('nonsense')), false);
});

const DAY_MS = 864e5;
const NOW = new Date('2026-09-16T09:00:00Z');

const item = (over: Partial<WireItem> = {}): WireItem => ({
  id: 'a1', src: 'NPR', how: 'satellite', kind: 'seg', title: 't', teaser: '',
  url: 'https://npr.org/a1', topic: 'news', when: 'today', len: 0, ...over,
});

const dayFile = (network: WireItem[] = []): DayFile => ({
  date: '2026-09-16', builtAt: NOW.toISOString(), network, stations: {},
  mostCarried: { title: '', url: '', stations: 0 },
});

// A blob double that only knows two prefixes, days/ and reads/ — everything sweepReads
// actually calls, nothing more. `daysHasMore` defaults false; only the days/-pagination test
// below sets it true.
const fakeBlob = (
  days: { url: string; pathname: string; uploadedAt: Date }[],
  reads: { url: string; pathname: string; uploadedAt: Date }[],
  onDelete: (urls: string[]) => void,
  daysHasMore = false,
): StoreBlobDeps => ({
  list: async ({ prefix }) => (prefix === 'days/' ? { blobs: days, hasMore: daysHasMore } : { blobs: reads, hasMore: false }),
  del: async (urls) => onDelete(urls),
});

test('a read older than 3 days and unreferenced is deleted', async () => {
  const dayUrl = 'https://blob.example/days/2026-09-16.json';
  const readUrl = 'https://blob.example/reads/old.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [{ url: dayUrl, pathname: 'days/2026-09-16.json', uploadedAt: NOW }],
    [{ url: readUrl, pathname: 'reads/old.wav', uploadedAt: new Date(NOW.getTime() - 4 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const realFetch = globalThis.fetch;
  // The surviving day file references nothing, so the read has no reason to be kept.
  globalThis.fetch = (async () => new Response(JSON.stringify(dayFile()))) as unknown as typeof fetch;
  try {
    const result = await sweepReads(NOW, blob);
    assert.deepEqual(result, ['reads/old.wav']);
    assert.deepEqual(deleted, [readUrl]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// This is the one protecting the player: day files sweep at 7 days, reads at 3, so a read
// referenced by a day file aged 4-7 must survive even though it's past its own window.
test('a read older than 3 days but still referenced by a surviving day file is kept', async () => {
  const dayUrl = 'https://blob.example/days/2026-09-16.json';
  const readUrl = 'https://blob.example/reads/still-used.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [{ url: dayUrl, pathname: 'days/2026-09-16.json', uploadedAt: NOW }],
    [{ url: readUrl, pathname: 'reads/still-used.wav', uploadedAt: new Date(NOW.getTime() - 5 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(dayFile([item({ audio: readUrl, spoken: true })])))) as unknown as typeof fetch;
  try {
    const result = await sweepReads(NOW, blob);
    assert.deepEqual(result, []);
    assert.deepEqual(deleted, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a read newer than 3 days is kept regardless of whether anything references it', async () => {
  const readUrl = 'https://blob.example/reads/fresh.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [], // no day files at all — nothing references anything
    [{ url: readUrl, pathname: 'reads/fresh.wav', uploadedAt: new Date(NOW.getTime() - 1 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const result = await sweepReads(NOW, blob);
  assert.deepEqual(result, []);
  assert.deepEqual(deleted, []);
});

// A read referenced only through a STATION's .local array, not day.network — the other half
// of `[...file.network, ...Object.values(file.stations).flatMap((s) => s.local)]`. Nothing
// above exercises this branch; a bug here would only ever surface against a real day file.
test('a read referenced only through a station local array is kept', async () => {
  const dayUrl = 'https://blob.example/days/2026-09-16.json';
  const readUrl = 'https://blob.example/reads/station-read.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [{ url: dayUrl, pathname: 'days/2026-09-16.json', uploadedAt: NOW }],
    [{ url: readUrl, pathname: 'reads/station-read.wav', uploadedAt: new Date(NOW.getTime() - 5 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const day: DayFile = {
    ...dayFile(),
    stations: { s921: { name: '88Nine', city: 'Milwaukee', neighbour: 's55', local: [item({ audio: readUrl, spoken: true })] } },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(day))) as unknown as typeof fetch;
  try {
    const result = await sweepReads(NOW, blob);
    assert.deepEqual(result, []);
    assert.deepEqual(deleted, []);
  } finally {
    globalThis.fetch = realFetch;
  }
});

// CRITICAL: a day file that fails to fetch must never be treated as "references nothing".
// A day 4-7 days old holds reads already past their own 3-day window — silently dropping it
// from the referenced set would delete audio a live file still plays, on the very next
// filter. The whole sweep must abort instead.
test('a day file that fails to fetch aborts the whole sweep — nothing gets deleted', async () => {
  const dayUrl = 'https://blob.example/days/2026-09-16.json';
  const readUrl = 'https://blob.example/reads/would-be-deleted.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [{ url: dayUrl, pathname: 'days/2026-09-16.json', uploadedAt: NOW }],
    [{ url: readUrl, pathname: 'reads/would-be-deleted.wav', uploadedAt: new Date(NOW.getTime() - 5 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const realFetch = globalThis.fetch;
  // A 500 with a valid-JSON body — not just a network rejection — to also prove res.ok is
  // checked: `.then(r => r.json())` alone would have happily parsed this as an empty day.
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'server error' }), { status: 500 })) as unknown as typeof fetch;
  try {
    // Asserted on the MESSAGE, not just that it rejects: without this, deleting the res.ok
    // check leaves the test passing for the wrong reason — `{error:...}` has no `.network`,
    // so `[...file.network, ...]` throws its own TypeError and satisfies a bare
    // assert.rejects just as well as the intended guard does.
    await assert.rejects(() => sweepReads(NOW, blob), /unreadable: 500/);
    assert.deepEqual(deleted, [], 'nothing should have been deleted once the day fetch failed');
  } finally {
    globalThis.fetch = realFetch;
  }
});

// IMPORTANT: a truncated days/ page means a truncated referenced set, which means real,
// still-playing audio looks unreferenced. Fail loudly rather than sweep on partial
// information.
test('a truncated days/ listing aborts the sweep rather than risk deleting referenced audio', async () => {
  const readUrl = 'https://blob.example/reads/would-be-deleted.wav';
  const deleted: string[] = [];
  // Empty `days` array on purpose, isolating this test to the hasMore flag alone: this page
  // of days/ happens to contain zero entries, but hasMore says another page exists. No day
  // file ever gets fetched, so nothing here depends on (or accidentally passes because of)
  // fetch behavior — a rejection can only come from the hasMore check itself.
  const blob = fakeBlob(
    [],
    [{ url: readUrl, pathname: 'reads/would-be-deleted.wav', uploadedAt: new Date(NOW.getTime() - 5 * DAY_MS) }],
    (urls) => deleted.push(...urls),
    true, // days/ claims there's another page we never fetched
  );
  await assert.rejects(() => sweepReads(NOW, blob));
  assert.deepEqual(deleted, []);
});

// CRITICAL: "referenced by a STORED day file" and "referenced right now" can disagree within
// one cron run. putDay's own day-file sweep can evict a day that turns 7 days old this
// morning; a cache hit can then set item.audio in memory to that same now-orphaned blob
// (same story, same readKey) before today's file is ever written. Built purely from storage,
// the referenced set would miss this and delete the blob seconds before today's file goes on
// to point at it. `alsoReferenced` is what the cron passes to say "this run's own in-memory
// item.audio values are referenced by definition" — this must hold even when NO stored day
// file mentions the URL at all.
test('a read passed via alsoReferenced survives even though no stored day file mentions it', async () => {
  const readUrl = 'https://blob.example/reads/cache-hit-orphan.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [], // no day files in storage at all — the only reference comes from alsoReferenced
    [{ url: readUrl, pathname: 'reads/cache-hit-orphan.wav', uploadedAt: new Date(NOW.getTime() - 5 * DAY_MS) }],
    (urls) => deleted.push(...urls),
  );
  const result = await sweepReads(NOW, blob, [readUrl]);
  assert.deepEqual(result, []);
  assert.deepEqual(deleted, []);
});
