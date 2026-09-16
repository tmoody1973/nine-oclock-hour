// Tests app/api/audition/route.ts directly — `pnpm test` only globs lib/**/*.test.ts, and a
// Next.js route handler is just an async function over the standard Request/Response, so it
// imports and runs here without a server. Lives under lib/ for that reason, not because it's
// a lib module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/audition/route';

test('an unknown voice is rejected with 400, before any network call', async () => {
  const realFetch = globalThis.fetch;
  let calls = 0;
  // A spy that throws if it's ever reached — proves the 400 is what stopped the request,
  // not that the fake network call happened to fail quietly.
  globalThis.fetch = (async () => {
    calls++;
    throw new Error('fetch should not have been called for an unknown voice');
  }) as unknown as typeof fetch;
  try {
    const res = await POST(new Request('http://localhost/api/audition', {
      method: 'POST', body: JSON.stringify({ voice: 'NotARealVoice' }),
    }));
    assert.equal(res.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('a missing or non-string voice is also rejected with 400', async () => {
  const res = await POST(new Request('http://localhost/api/audition', { method: 'POST', body: JSON.stringify({}) }));
  assert.equal(res.status, 400);
});
