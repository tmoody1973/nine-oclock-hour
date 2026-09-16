// Pure module: no 'server-only', no import from lib/reads.ts. Both the client voice picker
// (components/HourBuilder.tsx) and the server audition route (app/api/audition/route.ts)
// need this list — a second hardcoded copy would drift the moment a voice is added or
// removed. lib/reads.ts imports DEFAULT_VOICE from here too, so there's exactly one source.

// Thirty prebuilt Gemini TTS voices. Case-sensitive. Google publishes no personality
// descriptions and names no default.
export const VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe',
  'Charon', 'Despina', 'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore',
  'Laomedeia', 'Leda', 'Orus', 'Puck', 'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager',
  'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
] as const;

// Chosen by auditioning five candidates (Charon, Orus, Iapetus, Schedar, Puck) — see
// task-9b-report.md. Orus read as the deepest and least bright of the five by the one
// signal available for comparing them programmatically; there's no substitute for someone
// actually listening with the shipped audition button, and this default is one click away
// from being overridden if it's wrong.
export const DEFAULT_VOICE: (typeof VOICES)[number] = 'Orus';
