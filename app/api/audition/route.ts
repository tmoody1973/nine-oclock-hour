import { speak } from '@/lib/reads';
import { VOICES } from '@/lib/voices';

export const dynamic = 'force-dynamic';

// A newsroom-plausible sentence, not any publisher's actual text — same rule the real reads
// follow (see lib/reads.ts's scriptPrompt), just fixed instead of generated. This route only
// exists to let someone hear a voice's timbre, not to report anything.
const SAMPLE = "Good morning. Here's what's happening in the news this hour.";

// Takes `{ voice }` straight from the browser and feeds it into a paid API call and a
// request to Google — reject anything not in VOICES before either happens, not after.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const voice = body && typeof body === 'object' ? (body as { voice?: unknown }).voice : undefined;
  if (typeof voice !== 'string' || !(VOICES as readonly string[]).includes(voice)) {
    return new Response('unknown voice', { status: 400 });
  }
  try {
    const wav = await speak(SAMPLE, voice);
    // Transient by design — an audition is a preview, not a read. Nothing here is cached
    // or written to Blob, so auditioning never costs more than the one API call it takes.
    // Wrapped in a plain Uint8Array: Buffer's ArrayBufferLike type param doesn't line up
    // with the DOM lib's BodyInit typing, even though the bytes are identical at runtime.
    return new Response(new Uint8Array(wav), { headers: { 'content-type': 'audio/wav' } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'audition failed', { status: 502 });
  }
}
