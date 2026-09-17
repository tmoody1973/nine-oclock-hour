// Tests app/api/cron/build-day/route.ts directly — same trick as lib/audition.test.ts:
// `pnpm test` only globs lib/**/*.test.ts, and a Next.js route handler is just an async
// function over the standard Request/Response, so it imports and runs here without a server.
// Lives under lib/ for that reason, not because it's a lib module.
//
// Nothing in this file calls Gemini, runs a real day build, or touches Blob. That is not a
// promise, it is the thing being asserted: both auth gates refuse BEFORE buildDay() is
// reached, and every test proves it with a fetch spy that THROWS if anything downstream ever
// gets that far — a counter alone could pass on luck, a spy that throws cannot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/cron/build-day/route';

const request = (authorization?: string) =>
  new Request('http://localhost/api/cron/build-day', authorization ? { headers: { authorization } } : {});

// Runs `fn` with the network replaced by a spy that throws, and restores it afterwards
// whatever happens. Returns how many times anything tried to reach out.
async function withNoNetwork(fn: () => Promise<Response>): Promise<{ res: Response; calls: number }> {
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new Error('the cron reached the network past an auth gate that should have refused it');
  }) as unknown as typeof fetch;
  try {
    return { res: await fn(), calls };
  } finally {
    globalThis.fetch = realFetch;
  }
}

// 503, not 401, and BEFORE comparing anything: with CRON_SECRET unset the comparison would
// be against the literal string "Bearer undefined", and this repo is public — the route path
// and that exact string are readable by anyone. A deploy that skips `vercel env add
// CRON_SECRET` would otherwise leave nine CDS queries and a Blob write open to the world.
test('with CRON_SECRET unset the route refuses with 503, before any network call', async () => {
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    // The header a correctly-configured Vercel cron would send. It must not help: the fault
    // is ours, and "Bearer undefined" must never be a password.
    const { res, calls } = await withNoNetwork(() => GET(request('Bearer undefined')));
    assert.equal(res.status, 503);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
});

test('a wrong secret is refused with 401, before any network call', async () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'the-real-secret';
  try {
    const { res, calls } = await withNoNetwork(() => GET(request('Bearer not-the-real-secret')));
    assert.equal(res.status, 401);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
});

// The header-absent case is not the same code path as a wrong header, and it is the one an
// idle scanner actually hits: `req.headers.get()` returns null there, and null must fail the
// comparison rather than matching anything.
test('no authorization header at all is refused with 401, before any network call', async () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'the-real-secret';
  try {
    const { res, calls } = await withNoNetwork(() => GET(request()));
    assert.equal(res.status, 401);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
});

// An empty CRON_SECRET is unset as far as this gate is concerned — `if (!expected)` catches
// "" as well as undefined, and it must, or an env var set to nothing becomes a password that
// any request sending "Bearer " can guess.
test('an empty CRON_SECRET is treated as unset, not as a password', async () => {
  const saved = process.env.CRON_SECRET;
  process.env.CRON_SECRET = '';
  try {
    const { res, calls } = await withNoNetwork(() => GET(request('Bearer ')));
    assert.equal(res.status, 503);
    assert.equal(calls, 0);
  } finally {
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  }
});
