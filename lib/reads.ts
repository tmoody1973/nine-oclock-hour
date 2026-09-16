import 'server-only';
import { createHash } from 'node:crypto';
import { put, head } from '@vercel/blob';
import type { WireItem } from './types';

const API = 'https://generativelanguage.googleapis.com/v1beta/models';

export const scriptPrompt = (item: WireItem) => [
  `Write a radio read of about 55 words — about 30 seconds out loud — in your own words.`,
  `Name the source aloud once, like "${item.src} reports".`,
  `No adjectives you cannot source, no speculation, no sign-off.`,
  ``,
  `Headline: ${item.title}`,
  `What the newsroom says it is about: ${item.teaser}`,
].join('\n');

export const readKey = (item: WireItem, script: string) =>
  `reads/${item.id}-${createHash('sha256').update(script).digest('hex').slice(0, 12)}.mp3`;

type Voice = 'elevenlabs' | 'gemini';
export const backend = (): Voice => (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'gemini');

const ELEVEN_VOICE = 'onwK4e9ZLuTAKqWW03F9'; // Daniel — Steady Broadcaster

async function elevenSpeak(script: string): Promise<{ audio: Buffer; type: string }> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}`, {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ text: script, model_id: 'eleven_turbo_v2_5' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return { audio: Buffer.from(await res.arrayBuffer()), type: 'audio/mpeg' };
}

async function gemini(model: string, body: unknown) {
  const res = await fetch(`${API}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${model} ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function voiceRead(item: WireItem): Promise<string> {
  const written = await gemini('gemini-2.5-flash', { contents: [{ parts: [{ text: scriptPrompt(item) }] }] });
  const script: string = written.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
  if (!script) throw new Error(`no script for ${item.id}`);

  const key = readKey(item, script);
  try { return (await head(key)).url; } catch { /* not voiced yet */ }

  const spoken = await gemini('gemini-2.5-flash-preview-tts', {
    contents: [{ parts: [{ text: script }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
  });
  const b64 = spoken.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) throw new Error(`no audio for ${item.id}`);
  // Gemini returns raw PCM; wrap it as a WAV so browsers will play it.
  const pcm = Buffer.from(b64, 'base64');
  const wav = Buffer.alloc(44 + pcm.length);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);

  const { url } = await put(key.replace(/\.mp3$/, '.wav'), wav, { access: 'public', contentType: 'audio/wav', addRandomSuffix: false });
  return url;
}
