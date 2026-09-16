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
  // This route is public, unauthenticated, and spends real money — the repo is public, so
  // its path is readable by anyone, and voice validation only stops an INVALID voice;
  // nothing stops a million VALID ones. The 5 a.m. cron voices reads through this same
  // Gemini quota, so a sustained loop here doesn't just cost fractions of a cent — it can
  // break the morning build, which is the actual product. Off by default, same
  // refuse-when-unset instinct as CRON_SECRET in the cron route: a producer flips it on for
  // the afternoon they're choosing a voice, then off again. Checked first, before parsing
  // the body, before voice validation, before any chance of reaching speak().
  if (process.env.AUDITION_ENABLED !== '1') {
    return new Response('not found', { status: 404 });
  }

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
    // The real message (Google's error body, the model name) goes to the console, not the
    // wire — this route has no auth, so anyone who can reach it would otherwise get it too.
    // The key itself already moved off the URL to a header; this closes the other leak.
    console.error('audition failed:', err);
    return new Response('audition failed', { status: 502 });
  }
}
