export type How = 'satellite' | 'ours' | 'station' | 'podcast';
export type Topic = 'news' | 'politics' | 'world' | 'economy' | 'health' | 'tech' | 'culture' | 'climate' | 'local' | 'music';

export type WireItem = {
  id: string;
  src: string;            // "Morning Edition", "KCRW"
  how: How;
  kind: 'seg' | 'newscast';
  title: string;
  teaser: string;
  url: string;
  topic: Topic;
  when: string;           // "this morning", "yesterday"
  len: number;            // seconds of tape; 0 when there is none
  est?: number;           // estimated seconds when the feed carries no duration
  audio?: string;         // the PUBLISHER's tape; absent when there is no tape
  expires?: string;       // ISO time, newscasts only
  old?: boolean;          // filed before today
  // OUR voiced read, written by voiceRead() in the cron. A separate field from `audio`, not a
  // flag on it: reading a story that arrived WITH tape is a normal editorial call, so the two
  // have to coexist. While they shared one field, voicing such a story overwrote the tape href
  // and took the roll away from the producer — so the cron refused to voice it at all, and the
  // read played thirty seconds of silence instead.
  spokenAudio?: string;
  // LEGACY, read-only. Day files written before `spokenAudio` existed put the voiced read in
  // `audio` and set this flag, and those files stay on disk for their full seven days. Nothing
  // writes it any more; lib/wire.ts and lib/store.ts still READ it so yesterday's recordings
  // keep playing and do not get swept as unreferenced.
  spoken?: boolean;
};

export type DayFile = {
  date: string;           // YYYY-MM-DD
  builtAt: string;        // ISO
  network: WireItem[];
  stations: Record<string, { name: string; city: string; neighbour: string; local: WireItem[] }>;
  mostCarried: { title: string; url: string; stations: number };
  // Feeds that failed this morning, by label. Absent on a healthy day. Without this, a
  // total outage produces a perfectly well-formed file — empty network, six stations with
  // nothing in them — that is indistinguishable from a day when nobody filed. A file that
  // looks like success is worse than no file, because nothing downstream can tell.
  degraded?: string[];
};

// One thing scheduled in the hour. Wire items become blocks; so do the fixed pieces
// (legal ID, weather and traffic windows, pitch breaks, the credit, the bulletin).
export type Block = {
  id: string;
  label: string;
  len: number;             // seconds as scheduled
  how: How;
  kind: 'seg' | 'newscast';
  mode: 'tape' | 'read';
  topic: Topic;
  src?: string;
  audio?: string;
  realLen?: number;        // what untimed tape actually ran on air
  est?: boolean;           // the length was an estimate
  fixed?: boolean;         // the producer cannot remove it
  window?: boolean;        // weather or traffic
  credit?: boolean;        // the underwriting spot
  music?: boolean;
  bulletin?: boolean;
  expired?: boolean;       // a newscast past its time
  old?: boolean;           // filed before today
  long?: boolean;          // a full show inside the hour
  spoken?: boolean;        // a 'read' block whose audio is our own voiced wav, not a publisher's tape
};

export type Hour = Block[];
