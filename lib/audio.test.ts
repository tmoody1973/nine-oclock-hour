import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unlock } from './audio';

// A fake context, because there is no browser here and pretending otherwise is how the
// silent-clip bug survived 196 passing tests. These tests guard the DECISION unlock() makes
// about what a browser told it. Whether a real browser tells it the truth is a question only a
// real browser answers — see the iPhone check still outstanding in docs/HANDOFF-2026-09-17-phaser.md.
function ctx(states: AudioContextState[], resume?: () => Promise<void>) {
  let i = 0;
  const calls = { resume: 0 };
  const c = {
    get state() { return states[Math.min(i, states.length - 1)]; },
    async resume() {
      calls.resume++;
      i++;
      if (resume) await resume();
    },
  };
  return { c, calls };
}

test('a context already running is granted, and is not resumed again', async () => {
  const { c, calls } = ctx(['running']);
  assert.equal(await unlock(c), 'running');
  assert.equal(calls.resume, 0);
});

test('a suspended context that resumes into running reports the grant landed', async () => {
  const { c, calls } = ctx(['suspended', 'running']);
  assert.equal(await unlock(c), 'running');
  assert.equal(calls.resume, 1);
});

// THE TEST THIS FILE EXISTS FOR. resume() resolving means the request was processed, NOT that
// it was granted. The React path had no way to tell these apart and had to assume the good
// one; assuming it here would throw away the only thing the rewrite gains. A caller that gets
// 'suspended' must say so to the listener rather than starting a player that will never sound.
test('a resume that settles without granting reports suspended, and does not claim success', async () => {
  const { c } = ctx(['suspended', 'suspended']);
  assert.equal(await unlock(c), 'suspended');
});

test('a closed context reports closed rather than pretending it can play', async () => {
  const { c } = ctx(['closed', 'closed']);
  assert.equal(await unlock(c), 'closed');
});

// A rejected resume must not throw out of a click handler. The listener tapped a button; they
// get an answer, not an unhandled rejection and a control that silently does nothing.
test('a rejected resume is a refusal the caller can act on, not an exception', async () => {
  const { c } = ctx(['suspended', 'suspended'], () => Promise.reject(new Error('not allowed')));
  assert.equal(await unlock(c), 'failed');
});
