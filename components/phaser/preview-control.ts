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
