// Proves the property Important 3 exists to protect: a cache hit costs zero Gemini API
// calls, not one. Kept in its own file, separate from reads.test.ts, because node:test's
// module mocker (--experimental-test-module-mocks, set on `pnpm test`) only intercepts a
// module if the mock is installed BEFORE anything first imports it — reads.test.ts already
// imports the real './reads' (and therefore the real '@vercel/blob') at the top of its file.
// This file never statically imports './reads'; it mocks '@vercel/blob' first, then imports
// dynamically, so the mock is what lib/reads.ts's own `import { put, head } from
// '@vercel/blob'` resolves to.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { WireItem } from './types';

const item: WireItem = { id: 'cache-1', src: 'WBEZ', how: 'station', kind: 'seg',
  title: 'A cached headline', teaser: 'A cached teaser.', url: 'https://www.wbez.org',
  topic: 'local', when: '2026-09-16', len: 0 };

test('a cache hit skips the script call and the TTS call entirely', async () => {
  let headCalls = 0;
  const fakeUrl = 'https://blob.example/reads/already-cached.wav';
  // `namedExports`, not the newer `exports`: the installed @types/node (^20) predates the
  // node:test API this runtime actually ships, and only knows the deprecated option name.
  // Functionally identical — confirmed by the test passing — just a type-vs-runtime lag.
  mock.module('@vercel/blob', {
    namedExports: {
      head: async () => { headCalls++; return { url: fakeUrl }; },
      put: async () => { throw new Error('put should never run on a cache hit'); },
    },
  });

  const realFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error('no network call should happen on a cache hit');
  }) as unknown as typeof fetch;

  try {
    const { voiceRead } = await import('./reads');
    const url = await voiceRead(item, 'Kore');
    assert.equal(url, fakeUrl);
    assert.equal(headCalls, 1);
    assert.equal(fetchCalls, 0, 'a cache hit must make zero script or TTS calls');
  } finally {
    globalThis.fetch = realFetch;
  }
});
