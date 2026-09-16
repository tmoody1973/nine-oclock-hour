import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VOICES, DEFAULT_VOICE } from './voices';

test('VOICES is non-empty and contains DEFAULT_VOICE', () => {
  assert.ok(VOICES.length > 0);
  assert.ok(VOICES.includes(DEFAULT_VOICE));
});
