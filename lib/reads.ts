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
// and is followed by a blank line, plus any wrapping quote marks.
export function stripPreamble(text: string): string {
  const noLeadIn = text.trim().replace(/^[^\n]*:[ \t]*\n[ \t]*\n/, '');
  return noLeadIn.trim().replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();
}

// Both models have already changed once mid-build (the TTS one, 2.5 → 3.1) and will again —
// one named constant each makes the next swap a one-line change instead of a grep.
export const SCRIPT_MODEL = 'gemini-2.5-flash';
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
// DEFAULT_VOICE itself lives in lib/voices.ts — the pure module both this file and the
// client picker import, so there's exactly one place a new voice or a new default is set.

// Real output is a WAV we build ourselves (see voiceRead), never mp3 — the brief's own
// naming was wrong here. Voice is part of the key: the same script in two voices must cache
// as two objects, not one silently overwriting the other.
export const readKey = (item: WireItem, script: string, voice: string = DEFAULT_VOICE) =>
  `reads/${item.id}-${createHash('sha256').update(`${voice}:${script}`).digest('hex').slice(0, 12)}.wav`;

async function gemini(model: string, body: unknown) {
  const res = await fetch(`${API}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
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

export async function voiceRead(item: WireItem, voice: string = DEFAULT_VOICE): Promise<string> {
  const written = await gemini(SCRIPT_MODEL, { contents: [{ parts: [{ text: scriptPrompt(item) }] }] });
  const script: string = stripPreamble(written.candidates?.[0]?.content?.parts?.[0]?.text ?? '');
  if (!script) throw new Error(`no script for ${item.id}`);
  if (Buffer.byteLength(script, 'utf8') > MAX_TTS_BYTES) {
    throw new Error(`script for ${item.id} is ${Buffer.byteLength(script, 'utf8')} bytes, over the ${MAX_TTS_BYTES}-byte TTS limit`);
  }

  const key = readKey(item, script, voice);
  try { return (await head(key)).url; } catch { /* not voiced yet */ }

  const wav = await speak(script, voice);
  const { url } = await put(key, wav, { access: 'public', contentType: 'audio/wav', addRandomSuffix: false });
  return url;
}
