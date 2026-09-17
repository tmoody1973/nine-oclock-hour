import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { airBlocks, block, buildWire, legalIdBlock, rollable, used } from './wire';
import { layout } from './hour';
import { toWireItem } from './cds';
import { toPlaylist } from './playlist';
import type { DayFile, WireItem } from './types';

const item = (over: Partial<WireItem> = {}): WireItem => ({
  id: 'a1', src: 'Morning Edition', how: 'satellite', kind: 'seg',
  title: 'The Fed is expected to raise rates', teaser: '', url: 'https://npr.org/a1',
  topic: 'economy', when: '2026-09-16', len: 214, ...over,
});

// This is the assertion the whole task exists to prove: Task 7's aircheck matches
// `day.mostCarried.title` against `Block.label`, and nothing had confirmed the two meet.
test('block() sets label from the wire item title, not from anything else', () => {
  const b = block(item({ title: 'A very specific headline' }), 'tape');
  assert.equal(b.label, 'A very specific headline');
});

test('a read is always thirty seconds, regardless of the tape length', () => {
  const b = block(item({ len: 400 }), 'read');
  assert.equal(b.len, 30);
});

test('a tape roll uses the real length when the feed has one', () => {
  const b = block(item({ len: 214 }), 'tape');
  assert.equal(b.len, 214);
  assert.equal(b.est, false);
});

test('a tape roll with no known length falls back to the estimate and flags it', () => {
  const b = block(item({ len: 0, est: 210 }), 'tape');
  assert.equal(b.len, 210);
  assert.equal(b.est, true);
});

test('a newscast past its expiry is marked expired; one still good is not', () => {
  const now = Date.parse('2026-09-16T14:00:00Z');
  const stale = block(item({ expires: '2026-09-16T13:00:00Z' }), 'tape', now);
  const fresh = block(item({ expires: '2026-09-16T15:00:00Z' }), 'tape', now);
  assert.equal(stale.expired, true);
  assert.equal(fresh.expired, false);
});

test('an item with no expiry at all is never expired', () => {
  const b = block(item(), 'tape');
  assert.equal(b.expired, false);
});

test('a tape roll over 900 seconds is flagged long; a read never is', () => {
  const long = block(item({ len: 1749 }), 'tape');
  const read = block(item({ len: 1749 }), 'read');
  assert.equal(long.long, true);
  assert.equal(read.long, false);
});

// This is the rights guard the whole feature exists to protect. `item.audio` on a
// tape-carrying item is the publisher's own audio; adding it to the hour as a 'read'
// must never let that tape through. Only voiceRead()'s own audio — marked by
// `item.spoken` — may stream from a read block. Keying on `mode === 'read'` alone would
// pass this test too, which is exactly why it exists.
test("another newsroom's tape added as a read carries no audio, even though item.audio is set", () => {
  const b = block(item({ how: 'station', audio: 'https://wbez.example/tape.mp3' }), 'read');
  assert.equal(b.audio, undefined);
  assert.equal(b.spoken, false);
});

test('a voiced read carries its own audio, and is marked spoken', () => {
  const b = block(item({ len: 0, spokenAudio: 'https://blob.example/reads/x.wav' }), 'read');
  assert.equal(b.audio, 'https://blob.example/reads/x.wav');
  assert.equal(b.spoken, true);
});

// THE CASE THIS WHOLE CHANGE EXISTS FOR. Reading a story that arrived WITH publisher tape is
// a normal editorial call — a 4:40 tape becomes a 30-second read when the hour is tight. The
// cron used to skip voicing anything already carrying an audio href, so such a story had no
// voiced take of its own, and block() (correctly) refuses to stream a publisher's tape from a
// read. The listener got thirty seconds of silence. Now the publisher's tape and our own read
// live in two different fields and coexist: reading it plays OUR voice, and voicing it does
// not cost the producer the roll.
test('a story that came in with publisher tape can still be read aloud in our own voice', () => {
  const both = item({ audio: 'https://npr.example/tape.mp3', spokenAudio: 'https://blob.example/reads/x.wav' });
  const read = block(both, 'read');
  assert.equal(read.audio, 'https://blob.example/reads/x.wav', 'a read plays our voiced take, never silence');
  assert.equal(read.spoken, true);
  const tape = block(both, 'tape');
  assert.equal(tape.audio, 'https://npr.example/tape.mp3', 'and the producer keeps the roll — voicing must never overwrite the tape');
  assert.equal(tape.spoken, false);
});

// The two items on a real wire that have NO other outcome available: another newsroom's tape
// cannot be rolled at all, so a read is the only way they reach air. Our own voice is not
// subject to the tape rights gate, which is exactly why voicing every story is safe.
test("another newsroom's story reaches air as our voiced read, tape gate and all", () => {
  const both = item({ how: 'station', audio: 'https://wbez.example/tape.mp3', spokenAudio: 'https://blob.example/reads/y.wav' });
  const [entry] = toPlaylist([block(both, 'read')]);
  assert.equal(entry.audio, 'https://blob.example/reads/y.wav', "our read streams; their tape never does");
  assert.equal(toPlaylist([block(both, 'tape')])[0].audio, undefined, 'and the tape gate is untouched');
});

// MIGRATION, not a preference. Day files written before `spokenAudio` existed put the voiced
// read in `audio` and flagged it `spoken: true`, and those files stay readable for their full
// seven days — the page serves the latest stored day whenever this morning's build has not
// landed yet. Reading only the new field would send every one of yesterday's reads back to the
// silence this change exists to end.
test("a read stored in the old shape — voiced audio in `audio`, flagged spoken — still plays", () => {
  const legacy = item({ len: 0, audio: 'https://blob.example/reads/yesterday.wav', spoken: true });
  const b = block(legacy, 'read');
  assert.equal(b.audio, 'https://blob.example/reads/yesterday.wav');
  assert.equal(b.spoken, true);
});

test('spoken never applies to a tape block, regardless of the flag on the wire item', () => {
  const b = block(item({ audio: 'https://npr.example/tape.mp3', spoken: true }), 'tape');
  assert.equal(b.audio, 'https://npr.example/tape.mp3');
  assert.equal(b.spoken, false);
});

const day = (): DayFile => ({
  date: '2026-09-16', builtAt: '2026-09-16T05:00:00Z',
  network: [item({ id: 'net1' })],
  stations: {
    home: { name: 'Home Station', city: 'Home City', neighbour: 'nb', local: [item({ id: 'h1' }), item({ id: 'h2' })] },
    nb: { name: 'Neighbour Station', city: 'Neighbour City', neighbour: 'home', local: [item({ id: 'n1' }), item({ id: 'n2' }), item({ id: 'n3' })] },
  },
  mostCarried: { title: '', url: '', stations: 0 },
});

test('buildWire mixes network, the home station\'s own local items, and only the neighbour\'s first two', () => {
  const wire = buildWire(day(), 'home');
  assert.deepEqual(wire.map((w) => w.id), ['net1', 'h1', 'h2', 'nb-n1', 'nb-n2']);
});

// Not reachable through lib/day.ts today (it always writes all six stations), but the
// score() call site already treats a missing neighbour as possible, so this guards against
// the two disagreeing — and against a future caller that isn't lib/day.ts.
test('a station whose neighbour is missing from the day file gets network and its own items, no throw', () => {
  const broken = day();
  broken.stations.home.neighbour = 'does-not-exist';
  const wire = buildWire(broken, 'home');
  assert.deepEqual(wire.map((w) => w.id), ['net1', 'h1', 'h2']);
});

test('borrowed neighbour items are relabeled "station" so they cannot be rolled', () => {
  const wire = buildWire(day(), 'home');
  const borrowed = wire.find((w) => w.id === 'nb-n1')!;
  assert.equal(borrowed.how, 'station');
});

test('the home station\'s own items keep their own how, unchanged', () => {
  const wire = buildWire(day(), 'home');
  const own = wire.find((w) => w.id === 'h1')!;
  assert.equal(own.how, 'satellite'); // fixture default; buildWire must not touch it
});

test('used() finds a block regardless of whether it was added as tape or read', () => {
  const tapeBlock = block(item({ id: 'x' }), 'tape');
  const readBlock = block(item({ id: 'y' }), 'read');
  assert.equal(used([tapeBlock], item({ id: 'x' })), true);
  assert.equal(used([readBlock], item({ id: 'y' })), true);
  assert.equal(used([tapeBlock], item({ id: 'z' })), false);
});

// ─── The untimed item, and the dead air it used to cause ──────────────────────────────────
const untimedDoc = JSON.parse(readFileSync(new URL('./fixtures/untimed.json', import.meta.url), 'utf8')).resources[0];

// THE POINT OF THE est PRODUCER, and it was never the number. An item that arrives with the
// publisher's audio but no duration used to fall through BOTH paths at once:
//   - rollable() was false (len 0, est undefined), so the wire offered a disabled "No tape";
//   - the cron skips voicing anything already carrying an audio href — see
//     `if (item.audio || seenIds.has(item.id)) return false` in the build-day route — so it
//     was never spoken and item.spoken was never set;
//   - block(item, 'read') carries audio only for OUR OWN voiced take, so the block got none;
//   - toPlaylist then keeps the entry with audio undefined, and <Player> runs a timer for the
//     block's full length with nothing playing.
// Thirty seconds of dead air, on a radio product, for the one item class that neither path
// could serve. With est set the roll path opens again, which is what the front page promises
// the producer: "Untimed tape is a gamble. Roll one and you find out live."
test('an untimed item with publisher audio is rollable, not stranded between both paths', () => {
  const untimed = toWireItem(untimedDoc, 'satellite', 'WBEZ');
  assert.equal(untimed.len, 0, 'the feed never timed it');
  assert.ok(untimed.audio, 'but the tape itself is there to roll');
  assert.equal(rollable(untimed), true, 'so the producer must be offered it, at an estimate');
});

test('rolling an untimed item streams real audio, at its estimated length', () => {
  const untimed = toWireItem(untimedDoc, 'satellite', 'WBEZ');
  const [entry] = toPlaylist([block(untimed, 'tape')]);
  assert.equal(entry.audio, untimed.audio, 'satellite tape is ours to roll, so it streams');
  assert.equal(entry.seconds, untimed.est, 'scheduled at the estimate, not at the 30s read fallback');
});

// CHARACTERISATION, not a fix — this pins the SHAPE of dead air so it cannot return unnoticed,
// and it corrects a claim made during review: toPlaylist does NOT drop an unvoiced read. It
// keeps the entry and blanks its audio, which is why the failure is a silent timer rather than
// a missing track. A test asserting the entry is absent would fail against correct code.
//
// Both gates that produce this are deliberate RIGHTS protections with their reasoning written
// beside them: a read may carry audio only when it is our own voiced take, and toPlaylist
// streams tape only for satellite/ours. Neither may be loosened to chase the silence. The cure
// is upstream — let the producer roll it (est), or voice it.
test('an unvoiced read keeps its playlist entry and plays silent — the shape of dead air', () => {
  const unvoiced = item({ audio: 'https://wbez.example/tape.mp3' });
  const list = toPlaylist([block(unvoiced, 'read')]);
  assert.equal(list.length, 1, 'the entry is kept, not dropped');
  assert.equal(list[0].audio, undefined, "the publisher's tape must never stream from a read");
  assert.equal(list[0].seconds, 30, 'so the player runs a 30-second timer with nothing playing');
});

// ─── The legal ID, which is the first sixty seconds of every hour ─────────────────────────
// It opened on silence until now: one shared constant for six stations, so it could not say
// anyone's call letters, and it carried no audio at all. A producer pressing play got a minute
// of nothing and read the app as broken.

test('a station with a recorded identification carries it as our own voiced read', () => {
  const b = legalIdBlock({ legalId: 'https://blob.example/ids/wyms.wav' });
  assert.equal(b.audio, 'https://blob.example/ids/wyms.wav');
  assert.equal(b.spoken, true, 'our own recording — which is the only thing that lets a read carry audio');
  assert.equal(b.fixed, true, 'still the fixed block that opens the hour');
  assert.equal(b.len, 60);
});

// The rights gate in toPlaylist is not loosened for this — it is SATISFIED. A read streams only
// when `spoken` says the audio is our own rather than a publisher's tape, and an identification
// we recorded ourselves is exactly that. See lib/playlist.ts.
test('the recorded identification actually reaches the player', () => {
  const [entry] = toPlaylist([legalIdBlock({ legalId: 'https://blob.example/ids/wyms.wav' })]);
  assert.equal(entry.audio, 'https://blob.example/ids/wyms.wav', 'the hour opens on words, not on silence');
  assert.equal(entry.mode, 'read');
  assert.equal(entry.seconds, 60);
});

// Five of the six stations have given us nothing, and a call sign guessed from general knowledge
// is a licence violation spoken aloud. So they keep exactly today's behaviour — and the block
// itself says why, rather than presenting as the dead player this whole gap came from.
test('a station with no confirmed wording keeps its silent block, and says why', () => {
  const b = legalIdBlock({});
  assert.equal(b.audio, undefined, 'nothing to play, because nobody has given us the words');
  assert.ok(!b.spoken);
  // Pinned exactly, punctuation included, because the RAIL APPENDS ITS OWN SUFFIX to any read
  // block's label. A dash here would render as "Legal ID — no wording on file for this station —
  // read": two dashes and a sentence trailing into a stray word. The parenthetical parses on first
  // reading as "Legal ID (no wording on file) — read", and it fixes that without touching the row
  // weather and traffic share.
  assert.equal(b.label, 'Legal ID (no wording on file)', 'the rail and the player say so instead of looking broken');
  assert.equal(toPlaylist([b])[0].audio, undefined);
});

// ── The weather window, and how a window learns to carry audio ────────────────────────────
// The windows are not Blocks. `layout()` drops them in as FixedRows — `TimeWindow & { fixed,
// window }` — with no `mode`, no `how` and nowhere to put a URL, and `toPlaylist` was never
// handed them at all: the player's list came from the producer's own block array, so the two
// 45-second windows existed on the rail and in the score and NOWHERE in what actually played.
// `airBlocks` is the join: the laid-out hour, converted to real Blocks, which is what the
// player should have been playing all along.
const wxRow = { id: 'wx', at: 1140, len: 45, label: 'Weather window', fixed: true as const, window: true as const };

test('the weather window carries the station recording, and reaches the player', () => {
  const rows = [{ b: wxRow, at: 1140 }];
  const [entry] = toPlaylist(airBlocks(rows, { weather: 'https://blob.example/wx/2026-09-17-s921-abc.wav' }));
  assert.equal(entry.audio, 'https://blob.example/wx/2026-09-17-s921-abc.wav', 'the window has a forecast in it');
  assert.equal(entry.seconds, 45, 'and it still runs the 45 seconds the clock reserved');
  assert.equal(entry.mode, 'read');
});

// The rights gate in lib/playlist.ts is SATISFIED here, never loosened. A read streams only when
// `spoken` marks the audio as our own rather than a publisher's tape — and this is our own
// recording of public-domain government data. `spoken` is true only where a recording exists.
test('a station with no forecast this morning keeps a silent window, and invents nothing', () => {
  const [b] = airBlocks([{ b: wxRow, at: 1140 }], {});
  assert.equal(b.audio, undefined, 'no stale forecast, no fallback text');
  assert.equal(b.spoken, false, 'and the gate is told the truth about it');
  assert.equal(toPlaylist([b])[0].audio, undefined);
  assert.equal(b.len, 45, 'the window still holds its place in the hour');
});

test('the traffic window never claims to carry the weather recording', () => {
  const tx = { id: 'tx', at: 2940, len: 45, label: 'Traffic window', fixed: true as const, window: true as const };
  const [b] = airBlocks([{ b: tx, at: 2940 }], { weather: 'https://blob.example/wx/today.wav' });
  assert.equal(b.audio, undefined);
  assert.equal(b.spoken, false);
});

// A producer's own blocks pass through untouched — same object, so nothing about a story's
// audio, length or mode can be quietly rewritten on the way to the player.
test('the producer blocks pass through the conversion unchanged', () => {
  const b = block(item(), 'tape');
  const out = airBlocks([{ b, at: 0 }, { b: wxRow, at: 1140 }], {});
  assert.equal(out[0], b, 'the same block, not a copy that might differ');
  assert.equal(out.length, 2);
});

// THE REASON THIS EXISTS AT ALL: the played hour used to be 90 seconds shorter than the hour
// the rail promised, because both windows were missing from it.
test('the aired hour is the hour the rundown promised, windows included', () => {
  const hour = [legalIdBlock({}), block(item({ id: 'a1', len: 1200 }), 'tape'), block(item({ id: 'a2', len: 1800 }), 'tape')];
  const rows = layout(hour, false).rows;
  const list = toPlaylist(airBlocks(rows, {}));
  assert.equal(list.length, hour.length + 2, 'both windows are in what plays');
  assert.deepEqual(list.map((x) => x.title).filter((t) => t.includes('window')), ['Weather window', 'Traffic window']);
  const played = list.reduce((n, x) => n + x.seconds, 0);
  assert.equal(played, hour.reduce((n, b) => n + b.len, 0) + 90, 'the 90 seconds of windows are no longer skipped');
});
