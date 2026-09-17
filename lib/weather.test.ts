import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COORDS, forecast, weatherKey, weatherScript, type Period } from './weather';

// A REAL api.weather.gov response, captured 2026-09-17 for 43.0389,-87.9065 (Milwaukee) and
// trimmed to the fields weatherScript reads. Every test below runs against this rather than
// the network: the service is free, unauthenticated and run by a public agency, and hammering
// it from a test suite would be rude as well as slow.
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/forecast.json', import.meta.url), 'utf8'));
const periods: Period[] = FIXTURE.properties.periods;

test('the fixture is the shape the script depends on', () => {
  assert.equal(periods[0].name, 'Overnight');
  assert.equal(periods[0].isDaytime, false);
  assert.equal(periods[1].name, 'Thursday');
  assert.equal(periods[1].isDaytime, true);
});

// THE CONSTRAINT THAT SHAPES THE SCRIPT: recorded at 5 a.m., aired at 9. Anything phrased as
// a current observation is a lie by the time it airs, and the listener is looking out of the
// window while it plays. The API hands us named forecast PERIODS, which makes this natural —
// the test exists so nobody later "improves" the script into present tense.
test('the script speaks in forecast, never in current conditions', () => {
  const s = weatherScript('Milwaukee', periods);
  assert.ok(!/right now|currently|at the moment|it is \d|outside now/i.test(s), s);
  assert.match(s, /high near 71/);
});

test('the script names the place and credits the source', () => {
  const s = weatherScript('Milwaukee', periods);
  assert.match(s, /^The forecast for Milwaukee, from the National Weather Service\./);
});

// The first DAYTIME period, not periods[0]. At 5 a.m. periods[0] is "Overnight" — a stretch
// of night that is over before the hour airs.
test('the script leads on the next daytime period, not the overnight one', () => {
  const s = weatherScript('Milwaukee', periods);
  assert.match(s, /Thursday\. A chance of rain showers before noon\./);
  assert.ok(!s.includes('Overnight'), s);
});

test('the script carries the night that follows it', () => {
  const s = weatherScript('Milwaukee', periods);
  assert.match(s, /Thursday Night\. Partly cloudy, with a low around 60\./);
});

// The window is 45 seconds. A read that overruns it pushes every block after it, which is the
// exact failure this app scores a producer on.
test('the script fits the 45-second window', () => {
  const s = weatherScript('Milwaukee', periods);
  const words = s.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 100, `${words} words is too long for a 45-second window`);
  assert.ok(words >= 25, `${words} words is suspiciously short`);
});

// Trimmed from the END, by whole sentences, so what survives is still a sentence and the
// least important detail (rainfall amounts) is the first thing to go.
test('an over-long forecast is trimmed to whole sentences, never mid-sentence', () => {
  const windy: Period[] = [
    { ...periods[1], detailedForecast: Array.from({ length: 12 }, (_, i) => `Sentence number ${i} runs on and on and on.`).join(' ') },
    periods[2],
  ];
  const s = weatherScript('Milwaukee', windy);
  assert.ok(s.split(/\s+/).length <= 100);
  assert.match(s, /\.$/);
  assert.ok(!/Sentence number 11/.test(s), 'should have stopped before the end');
});

// A period name with nothing after it ("Thursday Night.") would air as a dangling word.
test('a period name is never left dangling by the trim', () => {
  const windy: Period[] = [
    { ...periods[1], detailedForecast: Array.from({ length: 10 }, () => 'Words words words words words words words.').join(' ') },
    periods[2],
  ];
  const s = weatherScript('Milwaukee', windy);
  assert.ok(!/Thursday Night\.\s*$/.test(s), s);
});

// Silence, never invention. An empty or night-only forecast has nothing honest to say.
test('no daytime period means no script at all', () => {
  assert.throws(() => weatherScript('Milwaukee', []), /no daytime period/i);
  assert.throws(() => weatherScript('Milwaukee', [periods[0]]), /no daytime period/i);
});

// Stale within hours, so the key carries the date AND the words. Same date, same station,
// same forecast on a re-run is a cache hit; a forecast that has been updated since is a new
// key and a new recording, never yesterday's audio served for today.
test('the weather key is scoped to the day and the station', () => {
  const s = weatherScript('Milwaukee', periods);
  assert.match(weatherKey('2026-09-17', 's921', s), /^wx\/2026-09-17-s921-[0-9a-f]{12}\.wav$/);
  assert.notEqual(weatherKey('2026-09-17', 's921', s), weatherKey('2026-09-18', 's921', s));
  assert.notEqual(weatherKey('2026-09-17', 's921', s), weatherKey('2026-09-17', 's308', s));
  assert.notEqual(weatherKey('2026-09-17', 's921', s), weatherKey('2026-09-17', 's921', `${s} And more.`));
  assert.notEqual(weatherKey('2026-09-17', 's921', s, 'Kore'), weatherKey('2026-09-17', 's921', s, 'Orus'));
});

test('every station in the directory has coordinates', () => {
  assert.deepEqual(Object.keys(COORDS).sort(), ['s150', 's295', 's308', 's55', 's552', 's921']);
});

// The two-step lookup, against a stub: /points/{lat},{lon} carries the gridpoint URL, and the
// forecast comes from THAT, not from a URL we assembled ourselves.
test('the lookup follows the gridpoint URL the service hands back', async () => {
  const seen: string[] = [];
  const stub = async (url: string | URL, init?: RequestInit) => {
    seen.push(String(url));
    assert.match(String((init?.headers as Record<string, string>)['User-Agent']), /nine-oclock-hour/);
    const body = seen.length === 1
      ? { properties: { forecast: 'https://api.weather.gov/gridpoints/MKX/88,65/forecast' } }
      : FIXTURE;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const got = await forecast(43.0389, -87.9065, stub as unknown as typeof fetch);
  assert.deepEqual(seen, [
    'https://api.weather.gov/points/43.0389,-87.9065',
    'https://api.weather.gov/gridpoints/MKX/88,65/forecast',
  ]);
  assert.equal(got[1].name, 'Thursday');
});

test('a refused lookup throws rather than returning something empty', async () => {
  const stub = async () => new Response('go away', { status: 403 });
  await assert.rejects(() => forecast(43.0389, -87.9065, stub as unknown as typeof fetch), /403/);
});
