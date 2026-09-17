import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_IDS } from './legalid';
import { STATIONS } from './day';

// A station identification is a REGULATORY obligation, not editorial copy: the FCC requires
// the call sign and the city of licence, spoken verbatim. Nothing else in this build is
// verbatim — every other read is deliberately rewritten in our own words by a model. So this
// file guards the two things no other test can reach: that the one confirmed wording is
// byte-for-byte what the station gave us, and that nobody has quietly added a station whose
// words nobody actually confirmed.

test('the home station wording is verbatim what the station gave us on 2026-09-17', () => {
  assert.equal(LEGAL_IDS.s921, "You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee");
});

// THE GUARD THAT MATTERS. Five stations have no confirmed wording, and deriving one from
// `name` + `city` is exactly how this goes wrong on air — the station table carries KQED's
// city as "the Bay Area", which is not a city of licence at all, and a call sign guessed from
// general knowledge is a licence violation read aloud. This test goes red the moment a station
// is added, which is the entire point: adding one must be a deliberate act carrying confirmed
// words. When a station really does confirm its wording, update this list in the same commit.
test('only stations that have actually confirmed their wording carry any', () => {
  assert.deepEqual(Object.keys(LEGAL_IDS), ['s921']);
});

test('every station with wording is a real station in the table', () => {
  for (const id of Object.keys(LEGAL_IDS)) assert.ok(id in STATIONS, `${id} is not a station in lib/day.ts`);
});
