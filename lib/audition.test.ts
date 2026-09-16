// Tests app/api/audition/route.ts directly — `pnpm test` only globs lib/**/*.test.ts, and a
// Next.js route handler is just an async function over the standard Request/Response, so it
// imports and runs here without a server. Lives under lib/ for that reason, not because it's
// a lib module.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../app/api/audition/route';

const request = (body: unknown) => new Request('http://localhost/api/audition', { method: 'POST', body: JSON.stringify(body) });

// The route is public and unauthenticated, and spends the same Gemini quota the 5 a.m. cron
// depends on — see the comment in route.ts. Off unless explicitly enabled, checked before
// anything else, so this test does NOT set AUDITION_ENABLED: it proves the real default.
test('audition is disabled by default: 404, before any network call', async () => {
  delete process.env.AUDITION_ENABLED;
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error('fetch should not have been called while disabled');
  }) as unknown as typeof fetch;
  try {
    const res = await POST(request({ voice: 'Orus' })); // a genuinely valid voice — the gate must still block it
    assert.equal(res.status, 404);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('an unknown voice is rejected with 400, before any network call — once enabled', async () => {
  process.env.AUDITION_ENABLED = '1';
  const realFetch = globalThis.fetch;
  let calls = 0;
  // A spy that throws if it's ever reached — proves the 400 is what stopped the request,
  // not that the fake network call happened to fail quietly.
  globalThis.fetch = (async () => {
    calls++;
    throw new Error('fetch should not have been called for an unknown voice');
  }) as unknown as typeof fetch;
  try {
    const res = await POST(request({ voice: 'NotARealVoice' }));
    assert.equal(res.status, 400);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AUDITION_ENABLED;
  }
});

test('a missing or non-string voice is also rejected with 400 — once enabled', async () => {
  process.env.AUDITION_ENABLED = '1';
  try {
    const res = await POST(request({}));
    assert.equal(res.status, 400);
  } finally {
    delete process.env.AUDITION_ENABLED;
  }
});

// A fake successful Gemini response — no real spend for this test, but it proves the gate
// doesn't accidentally block the path it's meant to allow once a producer turns it on.
test('when enabled, a valid voice reaches speak() and returns audio/wav', async () => {
  process.env.AUDITION_ENABLED = '1';
  const realFetch = globalThis.fetch;
  const fakePcm = Buffer.alloc(100).toString('base64');
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: fakePcm } }] } }] }), { status: 200 })
  ) as unknown as typeof fetch;
  try {
    const res = await POST(request({ voice: 'Orus' }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'audio/wav');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.AUDITION_ENABLED;
  }
});
