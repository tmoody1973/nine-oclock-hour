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
// actually calls, nothing more.
const fakeBlob = (days: { url: string; pathname: string; uploadedAt: Date }[], reads: { url: string; pathname: string; uploadedAt: Date }[], onDelete: (url: string) => void): StoreBlobDeps => ({
  list: async ({ prefix }) => ({ blobs: prefix === 'days/' ? days : reads }),
  del: async (url) => onDelete(url),
});

test('a read older than 3 days and unreferenced is deleted', async () => {
  const dayUrl = 'https://blob.example/days/2026-09-16.json';
  const readUrl = 'https://blob.example/reads/old.wav';
  const deleted: string[] = [];
  const blob = fakeBlob(
    [{ url: dayUrl, pathname: 'days/2026-09-16.json', uploadedAt: NOW }],
    [{ url: readUrl, pathname: 'reads/old.wav', uploadedAt: new Date(NOW.getTime() - 4 * DAY_MS) }],
    (url) => deleted.push(url),
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
    (url) => deleted.push(url),
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
    (url) => deleted.push(url),
  );
  const result = await sweepReads(NOW, blob);
  assert.deepEqual(result, []);
  assert.deepEqual(deleted, []);
});
