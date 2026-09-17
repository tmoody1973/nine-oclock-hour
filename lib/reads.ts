import 'server-only';
import { createHash } from 'node:crypto';
import { put, head } from '@vercel/blob';
import type { WireItem } from './types';
import { DEFAULT_VOICE } from './voices';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const scriptPrompt = (item: WireItem) => [
  `Write a radio read of about 55 words — about 30 seconds out loud — in your own words.`,
  `Name the source aloud once, like "${item.src} reports".`,
  `No adjectives you cannot source, no speculation, no sign-off.`,
  `Output the script only — no lead-in like "Here's your radio read:", no title, no preamble, no quotation marks around it.`,
  ``,
  `Headline: ${item.title}`,
  `What the newsroom says it is about: ${item.teaser}`,
].join('\n');

// The seatbelt, not the fix — the prompt above is the fix. A model can still open with a
// lead-in ("Here's your radio read:\n\n...") despite being asked not to; that line would be
// voiced aloud on air if it reached the TTS call. Drops a leading line that ends in a colon
// and is followed by a blank line, plus any wrapping quote marks — UNLESS that line names
// the source. scriptPrompt asks the model to name the source aloud like "${item.src}
// reports", and a plausible way for that to come out is "WBEZ reports:\n\n...", which looks
// exactly like a preamble but is actually the rights-required credit. Stripping it would
// air another newsroom's reporting uncredited — a rights bug, not a cosmetic one — so a
// leading line containing `src` is left alone even when it matches the lead-in shape.
export function stripPreamble(text: string, src: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^([^\n]*):[ \t]*\n[ \t]*\n([\s\S]*)$/);
  const withoutLeadIn = match && !match[1].includes(src) ? match[2] : trimmed;
  return withoutLeadIn.trim().replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();
}

// Both models have already changed once mid-build (the TTS one, 2.5 → 3.1) and will again —
// one named constant each makes the next swap a one-line change instead of a grep.
export const SCRIPT_MODEL = 'gemini-2.5-flash';
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
// DEFAULT_VOICE itself lives in lib/voices.ts — the pure module both this file and the
// client picker import, so there's exactly one place a new voice or a new default is set.

// Keyed on the deterministic INPUTS to a read — item id, source, headline, teaser, voice —
// never on the script the model happened to write. The script comes from a fresh,
// nondeterministic call every time, so keying on it meant the same story tomorrow, a manual
// re-run, or the same wire item carried by two stations all produced different text, a
// different key, and full-price TTS spend on every single run — a cache that looked like
// cost control and wasn't. Keying on inputs also means a corrected headline earns a new key
// by itself, rather than silently serving audio for the old one.
//
// `src` matters here too: scriptPrompt bakes it into the words ("${item.src} reports"), so
// two items that share an id, title and teaser but differ in src would otherwise collide on
// one key — the first voiced wins, and the second airs audio naming the wrong source.
export const readKey = (item: WireItem, voice: string = DEFAULT_VOICE) =>
  `reads/${item.id}-${createHash('sha256').update(`${voice}:${item.src}:${item.title}:${item.teaser}`).digest('hex').slice(0, 12)}.wav`;

// The legal ID's key, and it is keyed on the WORDS — never on the day. The wording almost never
// changes, so the same text in the same voice must resolve to the same stored object every
// morning: recorded once, then free on every run after. A date in the key would buy an identical
// recording daily, which is the whole cost of the feature paid over and over for nothing.
//
// The `ids/` prefix is load-bearing, not decoration. sweepReads (lib/store.ts) deletes objects
// under `reads/` older than three days that no stored day file still references, and it builds
// that referenced set with audioUrls(), which reads `audio`/`spokenAudio` on WIRE ITEMS only. A
// legal ID is referenced from a STATION record, so nothing would ever name it: under `reads/` it
// would be collected on the fourth morning and the hour would go back to opening on sixty
// seconds of silence, days later and invisibly. The sweep never lists this prefix. It is also
// simply the honest description — a legal ID is permanent, not one of today's reads.
export const legalIdKey = (text: string, voice: string = DEFAULT_VOICE) =>
  `ids/${createHash('sha256').update(`${voice}:${text}`).digest('hex').slice(0, 12)}.wav`;

async function gemini(model: string, body: unknown) {
  const res = await fetch(`${API}/${model}:generateContent`, {
    method: 'POST',
    // Not a `?key=` query param: outgoing URLs reach traces and observability tooling that a
    // header body doesn't. Nothing today interpolates it into a logged URL, but a header is
    // one line safer for a key protecting a public repo.
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  return res.json();
}

// Gemini TTS's own limit: text ≤ 4000 bytes. A ~75-word read is nowhere near it, but a
// malformed feed (a huge headline or teaser) shouldn't get to spend an API call finding
// that out — fail fast, before the network round trip.
const MAX_TTS_BYTES = 4000;

// Gemini returns raw PCM (16-bit, 24kHz) — never mp3 — so it has to be wrapped in a WAV
// container before a browser will play it. No ffmpeg/audio-lib dependency for a 44-byte
// header. Extracted so app/api/audition/route.ts can reuse it instead of pasting a second
// copy — a duplicated header is the kind of thing that gets fixed in one place and not
// the other.
export function pcmToWav(pcm: Buffer): Buffer {
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

// Calls the TTS model for one piece of text and returns a playable WAV. Also extracted so
// the audition route shares the exact request shape that's confirmed to return 200 — a
// second hand-typed copy of the body is exactly the kind of thing that drifts.
export async function speak(text: string, voice: string = DEFAULT_VOICE): Promise<Buffer> {
  const spoken = await gemini(TTS_MODEL, {
    contents: [{ parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
  });
  const b64 = spoken.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error('no audio in TTS response');
  return pcmToWav(Buffer.from(b64, 'base64'));
}

// The only part of head()/put() that voiceRead reads or writes — narrower than
// @vercel/blob's own return types on purpose, so a test double doesn't have to fake fields
// nothing here uses. Real `head`/`put` satisfy this structurally with no cast.
type BlobLike = { url: string };
type BlobDeps = {
  head: (key: string) => Promise<BlobLike>;
  put: (key: string, body: Buffer, opts: { access: 'public'; contentType: string; addRandomSuffix: boolean }) => Promise<BlobLike>;
};
const defaultBlobDeps: BlobDeps = { head, put };

// `blob` is a seam, not a config option: real callers never pass it and get the real
// @vercel/blob functions via the default, exactly like `now = Date.now()` in lib/wire.ts.
// It exists so a test can prove "a cache hit makes zero API calls" with a counting stub,
// instead of mocking the @vercel/blob module itself — no experimental Node flag, no global
// test-command change, nothing that can break on a future Node's module-mocking API.
export async function voiceRead(item: WireItem, voice: string = DEFAULT_VOICE, blob: BlobDeps = defaultBlobDeps): Promise<string> {
  // Cache check first, before either Gemini call — a cache hit now costs zero API calls,
  // not the one script-generation call it used to spend even when the TTS step was skipped.
  const key = readKey(item, voice);
  try { return (await blob.head(key)).url; } catch { /* not voiced yet */ }

  const written = await gemini(SCRIPT_MODEL, { contents: [{ parts: [{ text: scriptPrompt(item) }] }] });
  const script: string = stripPreamble(written.candidates?.[0]?.content?.parts?.[0]?.text ?? '', item.src);
  if (!script) throw new Error(`no script for ${item.id}`);
  if (Buffer.byteLength(script, 'utf8') > MAX_TTS_BYTES) {
    throw new Error(`script for ${item.id} is ${Buffer.byteLength(script, 'utf8')} bytes, over the ${MAX_TTS_BYTES}-byte TTS limit`);
  }

  const wav = await speak(script, voice);
  const { url } = await blob.put(key, wav, { access: 'public', contentType: 'audio/wav', addRandomSuffix: false });
  return url;
}


// Records one station's legal identification and returns its URL.
//
// Deliberately NOT voiceRead(). That function sends the item to the script model to be rewritten
// in its own words and records whatever comes back — right for a news read, catastrophic here. A
// station identification is a regulatory obligation that airs verbatim, so the station's text
// goes straight to TTS with nothing in between. There is no prompt on this path, by design, and
// lib/reads.test.ts pins that: exactly one model call, and the script model never sees it.
//
// Same `blob` seam as voiceRead — real callers never pass it and get the real @vercel/blob
// functions via the default.
export async function voiceId(text: string, voice: string = DEFAULT_VOICE, blob: BlobDeps = defaultBlobDeps): Promise<string> {
  const key = legalIdKey(text, voice);
  // Before the only paid call on this path. After the first morning this is the whole function.
  try { return (await blob.head(key)).url; } catch { /* not recorded yet */ }

  const wav = await speak(text, voice);
  const { url } = await blob.put(key, wav, { access: 'public', contentType: 'audio/wav', addRandomSuffix: false });
  return url;
}
