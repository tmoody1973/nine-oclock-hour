import type { How, Topic } from './types';

// NPR's own topic collections are the sections of the paper. Confirmed live 2026-09-16.
const BY_ID: Record<string, Topic> = {
  1014: 'politics', 1057: 'politics', 1059: 'politics', 1070: 'politics',
  1004: 'world', 1126: 'world',
  1017: 'economy', 1006: 'economy', 1095: 'economy',
  1128: 'health', 1027: 'health',
  1019: 'tech', 1007: 'tech', 1024: 'tech', 1026: 'tech',
  1008: 'culture', 1032: 'culture', 1045: 'culture', 1046: 'culture', 1047: 'culture',
  1048: 'culture', 1051: 'culture', 1053: 'culture', 1141: 'culture', 1020: 'culture', 1013: 'culture',
  1025: 'climate',
  1039: 'music', 1103: 'music', 1105: 'music',
  1003: 'news', 1001: 'news',
};

// Station copy carries no topic collection, so the desk comes from the headline and the
// teaser. First match wins, so the most specific pattern goes first.
const BY_WORD: [Topic, RegExp][] = [
  ['music',    /\b(album|band|musician|song|concert|jazz|hip.?hop|orchestra|record label|singer|music\b|vinyl|rapper|choir|symphony|record shop|setlist|headliner)/i],
  ['climate',  /\b(climate|emissions|drought|wildfire|flooding|heat wave|solar|coal\b|pipeline|carbon)/i],
  ['health',   /\b(hospital|patient|doctor|vaccine|medicaid|medicare|mental health|opioid|clinic|disease|birth control)/i],
  ['tech',     /\b(\bai\b|artificial intelligence|software|chip|startup|semiconductor|algorithm|data centre|data center|nasa|researchers)/i],
  // These two are proper nouns whose lower-case forms are ordinary English words, so they
  // deliberately OMIT the /i flag. That is the entire mechanism: it is what separates
  // "Fed holds rates steady" from "volunteers fed 300 people". Do not add /i to these two
  // lines, and do not fold them into the case-insensitive lines below.
  ['economy',  /\bFed\b/],
  ['world',    /\bEU\b/],
  ['economy',  /\b(econom|inflation|tariff|unemploy|wages?|rent|housing market|budget|tax(es|payer)?|layoff|federal reserve|interest rate)/i],
  ['politics', /\b(mayor|alderman|city council|governor|senat|congress|legislat|election|campaign|reelection|ballot|impeach|court|lawsuit|immigration|ice\b)/i],
  ['world',    /\b(ukraine|gaza|israel|china|russia|nato|migrants?|border|foreign minister|united nations)/i],
  ['culture',  /\b(museum|festival|artist|theatre|theater|film|novel|exhibit|restaurant|chef|arts spending|mural)/i],
];

export function classify(collectionIds: string[], text: string, how: How): Topic {
  for (const id of collectionIds) { const desk = BY_ID[id]; if (desk) return desk; }
  for (const [desk, re] of BY_WORD) if (re.test(text)) return desk;
  return how === 'ours' || how === 'station' ? 'local' : 'news';
}
