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
  audio?: string;         // stream URL; absent when there is no tape
  expires?: string;       // ISO time, newscasts only
  old?: boolean;          // filed before today
};

export type DayFile = {
  date: string;           // YYYY-MM-DD
  builtAt: string;        // ISO
  network: WireItem[];
  stations: Record<string, { name: string; city: string; neighbour: string; local: WireItem[] }>;
  mostCarried: { title: string; url: string; stations: number };
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
};

export type Hour = Block[];
