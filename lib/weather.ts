import 'server-only';
import { createHash } from 'node:crypto';
import { DEFAULT_VOICE } from './voices';

// The weather that fills the 19:00 window, from api.weather.gov — the National Weather
// Service's own API. Free, unauthenticated, no registration, and the data is a work of the
// United States government, so it is public domain: our recording of it is ours to air. That
// is the whole rights argument for the window, and it is why this file exists rather than a
// commercial feed with a licence attached.
//
// Fetching lives in `forecast()` and the words live in `weatherScript()`, deliberately apart:
// the script is the part that can be wrong on air, and it is tested against a captured
// response (lib/fixtures/forecast.json) with no network call at all.

// api.weather.gov REFUSES a request with no User-Agent — stated policy, and confirmed live.
// It asks for something that identifies the caller so they can get in touch if we misbehave,
// so this names the repo rather than a person: a public URL is a contact address that does
// not put anybody's inbox in an outgoing header.
const UA = 'nine-oclock-hour (+https://github.com/tmoody1973/nine-oclock-hour)';

// Where each station's forecast comes from. Every one of these was checked against the live
// service, which echoes back the city it matched — the comment beside each odd one is the
// decision, not a guess.
//
// The rule: THE READ DESCRIBES THE PLACE THE SCREEN NAMES. `weatherScript` is handed the
// station's own `city` from lib/day.ts, so if the coordinates point somewhere else the read
// says one town while the producer's screen says another. Two stations needed a call:
//
//   s55 KCRW — the app shows "Los Angeles"; the station itself sits in Santa Monica, and the
//   coordinates that were handed to me (34.0195,-118.4912) resolve to Santa Monica. Coastal
//   and inland Los Angeles genuinely differ — a summer marine layer is a real fifteen degrees
//   — so this is not pedantry about a label. Moved INLAND to downtown Los Angeles
//   (34.0522,-118.2437), confirmed resolving to "Los Angeles, CA", so the forecast is for the
//   city named on screen and on air. The alternative (keep Santa Monica, relabel the station)
//   would mean editing the station directory to disagree with how KCRW describes itself.
//
//   s150 KQED — the app shows "the Bay Area", which is not a place any weather service can
//   look up; the Bay Area is several microclimates in a trench coat. San Francisco is the
//   resolution, and it is the honest one: it is where the station is and what most people mean.
//   The read still says "the Bay Area", because that is what the screen says, and this comment
//   is the record that the grid behind it is San Francisco's.
export const COORDS: Record<string, { lat: number; lon: number }> = {
  s921: { lat: 43.0389, lon: -87.9065 },  // Milwaukee, WI
  s55: { lat: 34.0522, lon: -118.2437 },  // Los Angeles, CA — see above
  s308: { lat: 41.8781, lon: -87.6298 },  // Chicago, IL
  s552: { lat: 40.7128, lon: -74.006 },   // New York, NY
  s295: { lat: 33.749, lon: -84.388 },    // Atlanta, GA
  s150: { lat: 37.7749, lon: -122.4194 }, // San Francisco, CA — see above
};

// Only the fields the script reads. Narrower than what the service returns on purpose, the
// same way lib/reads.ts narrows @vercel/blob: a test fixture should not have to carry a
// field nothing looks at.
export type Period = {
  name: string;               // "Overnight", "Thursday", "Thursday Night"
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  shortForecast: string;      // "Chance Rain Showers"
  detailedForecast: string;   // already in broadcast prose — see weatherScript
};

// Two steps, and the second URL is NEVER assembled here. /points/{lat},{lon} answers with the
// gridpoint forecast URL for that spot, and we follow it; the grid a coordinate falls in is
// the service's business, not ours, and it has moved before.
export async function forecast(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<Period[]> {
  const get = async (url: string) => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
    if (!res.ok) throw new Error(`weather.gov ${res.status} for ${url}`);
    return res.json();
  };
  const point = await get(`https://api.weather.gov/points/${lat},${lon}`);
  const url: string | undefined = point?.properties?.forecast;
  if (!url) throw new Error(`no forecast URL for ${lat},${lon}`);
  const periods: Period[] | undefined = (await get(url))?.properties?.periods;
  if (!periods?.length) throw new Error(`no forecast periods for ${lat},${lon}`);
  return periods;
}

// 45 seconds of window. At a newsreader's ~140 words a minute that is about 105 words, so the
// budget stops a little short of it: the block is scheduled at 45 seconds and a recording that
// overruns pushes everything after it, which is precisely what this app scores a producer on.
const WORD_BUDGET = 100;
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Whole sentences. The trim below cuts from the end, so a split that is slightly off only
// changes WHERE it stops, never what the surviving words say. NWS prose writes numbers out
// ("less than a tenth of an inch"), so there are no decimal points to trip on today.
const sentences = (text: string) => text.match(/[^.]+\./g)?.map((s) => s.trim()) ?? [text.trim()];

// The period's name is glued to its first sentence so the trim can never leave "Thursday
// Night." dangling on its own at the end of the read.
const unitsFor = (p: Period) => {
  const [first, ...rest] = sentences(p.detailedForecast);
  return [`${p.name}. ${first}`, ...rest];
};

// Composed here, from the service's own fields. NOT sent to a model to be written: a forecast
// that has been creatively improved is a forecast that is wrong, and a model asked to make
// weather sound natural will reach for "it's raining out there right now" — see below. The
// same reasoning that keeps a legal ID away from voiceRead() (lib/reads.ts).
//
// THE CONSTRAINT: this is recorded at 5 a.m. and airs at 9. Four hours old. So it may only
// ever speak in FORECAST — "high near 71, rain before noon" — and never in current
// conditions. A listener is looking out of the window while it plays; a confidently wrong
// "it's raining right now" is worse than leaving the window silent. The API makes this easy
// rather than hard: it hands back named periods, and `detailedForecast` is already written in
// broadcast prose by the forecaster ("A chance of rain showers before noon. Mostly cloudy,
// with a high near 71. Northeast wind 5 to 10 mph."), so it is used VERBATIM. Nothing here
// rewords it, and nothing should.
//
// Leads on the first DAYTIME period, not periods[0]: at 5 a.m. that first entry is "Overnight",
// a stretch of night that is over before the hour airs. `place` is the station's own city from
// lib/day.ts, so the read names the place the producer's screen names.
export function weatherScript(place: string, periods: Period[]): string {
  const i = periods.findIndex((p) => p.isDaytime);
  // No fallback, no "weather unavailable" filler. The caller turns this into silence and a
  // marker in `degraded`, which is the honest outcome — see the cron.
  if (i < 0) throw new Error('no daytime period in the forecast');

  const lead = `The forecast for ${place}, from the National Weather Service.`;
  const rest = [...unitsFor(periods[i]), ...(periods[i + 1] ? unitsFor(periods[i + 1]) : [])];

  const out = [lead];
  let n = wordCount(lead);
  for (const unit of rest) {
    // `break`, never `continue`: these are consecutive sentences of one forecast, and skipping
    // a middle one to fit a later one would air as nonsense.
    if (n + wordCount(unit) > WORD_BUDGET) break;
    out.push(unit);
    n += wordCount(unit);
  }
  return out.join(' ');
}

// WHERE THE RECORDINGS LIVE, AND WHAT SWEEPS THEM: NOTHING DOES, TODAY.
//
// A deliberate third prefix, beside `reads/` and `ids/`, because weather is neither of the
// things those hold:
//
//   `reads/` is swept — sweepReads (lib/store.ts) deletes objects there older than three days
//   that no stored day file still references, and it builds that referenced set with
//   audioUrls(), which reads `audio`/`spokenAudio` on WIRE ITEMS ONLY. A weather recording is
//   referenced from a STATION record, exactly like `legalId`, so nothing would ever name it:
//   filed under `reads/` it would be swept on the fourth morning and the window would go quiet
//   again, days later and invisibly. That is the trap `ids/` was created to dodge.
//
//   `ids/` is never swept, and correctly so — a legal ID is permanent, recorded once and
//   cached forever. Weather is the opposite: stale within hours, and yesterday's is useless.
//
// So: nothing lists `wx/`, and nothing deletes from it. Six stations × one recording a day is
// six objects a morning, ~1.4 MB each at 24kHz 16-bit mono for a 30-second read — call it
// 8 MB a day, ~3 GB a year, growing forever. That is a real bill and it is named here rather
// than discovered. The fix when it matters is small and deliberately NOT built today: sweeping
// `wx/` needs no referenced-set arithmetic at all, because nothing older than yesterday can
// ever be worth keeping — a plain age check on this prefix is the whole job. (ponytail: one
// prefix, no sweeper; add the age sweep when the bill shows up, or when a day file older than
// a day is ever expected to replay its weather.)
//
// Keyed on the DATE, the STATION and the WORDS. The date and station make it legible and make
// that future sweep trivial; the words are what make a re-run of the same morning a free cache
// hit, while a forecast the service has revised since earns a new key and a new recording.
// Never keyed on the date alone: that would serve a morning's first, now-superseded forecast
// for the rest of the day.
export const weatherKey = (date: string, station: string, script: string, voice: string = DEFAULT_VOICE) =>
  `wx/${date}-${station}-${createHash('sha256').update(`${voice}:${script}`).digest('hex').slice(0, 12)}.wav`;
