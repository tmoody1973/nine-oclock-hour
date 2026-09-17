// What the card needs to draw the "Hear it" control, kept out of Card.tsx so the card stays a
// view and the economy stays in Stage.
export type PreviewControl = {
  // Minutes this costs, or null when it is free — you have already paid to hear this one.
  readonly price: number | null;
  // Why you cannot: nothing to hear, or not enough morning left. In words, never a bare
  // greyed-out button.
  readonly blocked: string | null;
  // Whose server it streams from, said plainly.
  readonly note: string | null;
  readonly playing: boolean;
  readonly onToggle: () => void;
};

// What the card needs to offer a story to the hour. Two modes, because tape-or-read is the
// editorial call the whole rights system exists around: a 4:40 tape becomes a thirty-second
// read when the hour is tight, and another newsroom's story can only ever be the read.
export type PlaceControl = {
  // Minutes placing costs, or null when this story is already in the hour.
  readonly price: number | null;
  readonly already: boolean;
  // Absent when there is no tape to roll at all; `blocked` when there is tape but the rights
  // say it is not ours to air.
  readonly tape: { readonly label: string; readonly blocked: string | null } | null;
  readonly read: { readonly label: string; readonly blocked: string | null };
  readonly onPlace: (mode: 'tape' | 'read') => void;
};

// Taking a story back out. One price for moving and for removing — Tarik's call: the clock does
// not care what you intended, and two prices means explaining two rules. The price rises through
// the morning, because pulling at 5:30 is cheap and pulling at 8:50 is not.
export type RemoveControl = {
  readonly price: number;
  readonly blocked: string | null;
  readonly onRemove: (blockId: string) => void;
};
