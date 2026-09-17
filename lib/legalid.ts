// Station key → the exact words that station's identification airs with. CONFIRMED WORDING
// ONLY.
//
// A station identification is a regulatory obligation, not editorial copy: the FCC requires the
// call sign and the city of licence, and it airs verbatim. That makes it the one piece of audio
// in this build that is never rewritten — every other read is deliberately put into our own
// words by a model (lib/reads.ts), and doing that to a legal ID is the worst outcome available.
//
// Adding a station here means somebody AT that station gave us the words. It does not mean
// deriving them from `name` and `city` in lib/day.ts: that table carries KQED's city as "the
// Bay Area", which is not a city of licence at all, and a call sign recalled from general
// knowledge is a licence violation spoken aloud on somebody else's licence. A station that is
// not in this map keeps a silent opening block that says why — see legalIdBlock in lib/wire.ts.
//
// Plain data with no imports on purpose: the cron reads it, lib/legalid.test.ts pins it, and
// neither has to drag in anything server-only to do so.
export const LEGAL_IDS: Record<string, string> = {
  // 88Nine Radio Milwaukee (s921) — confirmed by the station, 2026-09-17.
  s921: "You're listening to 88Nine Radio Milwaukee, WYMS Milwaukee",
};
