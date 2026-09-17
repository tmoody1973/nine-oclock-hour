// What the morning costs.
//
// Decided with Tarik, 2026-09-17. Two rules set everything below:
//
//   1. ONLY ACTIONS COST. Thinking, looking and scanning the strip are free. No wall clock
//      ticks while you decide. This is a game about judgement, and a real clock would punish
//      the one thing it is asking you to do. The morning is a budget you spend, not a timer
//      you race.
//   2. THE BUDGET MUST MAKE ONE CLAIM TRUE: "You cannot audition twenty-six stories before
//      nine — and neither can a real producer" (docs/phaser-design.md). That is not flavour
//      text, it is the constraint the whole game hangs off, so morning.test.ts asserts it
//      arithmetically. If anyone retunes these numbers until auditioning everything fits, the
//      suite goes red and says why.
//
// Five o'clock to nine o'clock, in minutes of the producer's morning.
export const MORNING_START = 5 * 60;
export const ON_AIR = 9 * 60;
export const MORNING_MINUTES = ON_AIR - MORNING_START;

export type Action = 'flip' | 'preview' | 'place' | 'move';

// Whole multiples of five, because a producer thinks in five-minute blocks and a cost you
// cannot hold in your head is a cost you cannot plan against.
export const COSTS: Record<Exclude<Action, 'move'>, number> = {
  // Reading the headline, the teaser and the placement note, and thinking about it.
  flip: 5,
  // FLAT, and deliberately the most expensive thing you can do. Flat rather than per-second
  // for two reasons: the decision worth making is *whether to listen at all*, and once you
  // have paid, sitting through the whole piece costs nothing extra — which matters because
  // the hour is meant to be a real news product, not a thing you sample and discard.
  preview: 15,
  // Dropping a card onto the clock.
  place: 5,
};

// Moving and removing are ONE price — Tarik's call: the clock does not care what you intended,
// and two prices means explaining two rules. The real cost is the reflow, which lib/hour.ts's
// layout() already computes; this is the flat time cost on top of it.
const MOVE_BASE = 10;
// Pulling at 5:30 is cheap, because you have hours to repair it. Pulling at 8:50 is expensive,
// because you do not. Tripling across the morning puts the pressure where the job puts it.
const MOVE_LATE_MULTIPLE = 3;

// What an action costs, given how much of the morning has already gone.
export function costOf(action: Action, spent: number): number {
  if (action !== 'move') return COSTS[action];
  const through = Math.min(1, Math.max(0, spent / MORNING_MINUTES));
  return Math.round(MOVE_BASE * (1 + (MOVE_LATE_MULTIPLE - 1) * through));
}

export const remaining = (spent: number): number => Math.max(0, MORNING_MINUTES - spent);

// An action you cannot afford is refused rather than allowed to overrun. The hour still airs
// at nine either way; what runs out is your chance to change it.
export const canAfford = (action: Action, spent: number): boolean => costOf(action, spent) <= remaining(spent);

// Never clamped below zero and never past nine: the readout is the one number on screen that
// must always mean exactly one thing. See lib/player.ts's clock() for the same lesson learned
// the hard way — an hour counter that could run backwards read as broken.
export const spend = (action: Action, spent: number): number =>
  Math.min(MORNING_MINUTES, spent + costOf(action, spent));

// Where the morning stands, as a time of day: 0 spent is 5:00, all of it spent is 9:00.
export const morningClock = (spent: number): string => {
  const m = MORNING_START + Math.min(Math.max(0, spent), MORNING_MINUTES);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

// Why a control is disabled, in words. The React build explained every disabled control in
// text rather than by greying it out, and that carries over: colour is never the only signal.
export const whyNot = (action: Action, spent: number): string | null =>
  canAfford(action, spent)
    ? null
    : `Not enough morning left — that costs ${costOf(action, spent)} minutes and you have ${remaining(spent)}.`;
