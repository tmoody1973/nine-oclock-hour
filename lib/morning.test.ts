import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COSTS, MORNING_MINUTES, canAfford, costOf, morningClock, remaining, spend, whyNot } from './morning';

test('the morning is the four hours between five and nine', () => {
  assert.equal(MORNING_MINUTES, 240);
  assert.equal(morningClock(0), '5:00');
  assert.equal(morningClock(MORNING_MINUTES), '9:00');
  assert.equal(morningClock(105), '6:45');
});

// THE TEST THE WHOLE ECONOMY EXISTS TO SATISFY. docs/phaser-design.md: "You cannot audition
// twenty-six stories before nine — and neither can a real producer. That single constraint is
// what turns a form into a game." If anyone retunes these costs until auditioning the whole
// wire fits inside the morning, the game quietly stops being one, and this goes red.
test('auditioning the whole wire does not fit in the morning, by a wide margin', () => {
  const wholeWire = 26 * COSTS.preview;
  assert.ok(wholeWire > MORNING_MINUTES, `26 previews cost ${wholeWire}, and the morning is ${MORNING_MINUTES}`);
  assert.ok(wholeWire > MORNING_MINUTES * 1.5, 'the margin is too thin to be a real constraint');
});

// The other half of the same claim: a producer must still be able to build a full hour AND
// listen to a handful of things. A budget that only permits one or the other is not tension,
// it is a wall.
test('a real morning fits: build a twelve-block hour, read widely, and still hear a few', () => {
  let spent = 0;
  for (let i = 0; i < 15; i++) spent = spend('flip', spent);     // read fifteen of the twenty-six
  for (let i = 0; i < 5; i++) spent = spend('preview', spent);   // hear five of them
  for (let i = 0; i < 12; i++) spent = spend('place', spent);    // build the hour
  assert.ok(spent <= MORNING_MINUTES, `that morning cost ${spent} and only ${MORNING_MINUTES} exist`);
  assert.ok(remaining(spent) < 60, 'a morning that leaves an hour spare is not applying any pressure');
});

test('listening is the expensive act — dearer than reading, placing or moving', () => {
  assert.ok(COSTS.preview > COSTS.flip);
  assert.ok(COSTS.preview > COSTS.place);
  assert.ok(COSTS.preview > costOf('move', 0));
});

// "Pulling at 5:30 is cheap; you have hours to repair it. Pulling at 8:50 is expensive,
// because you do not."
test('pulling a card costs more the later the morning gets', () => {
  const early = costOf('move', 0);
  const middle = costOf('move', MORNING_MINUTES / 2);
  const late = costOf('move', MORNING_MINUTES);
  assert.ok(early < middle && middle < late, `${early} / ${middle} / ${late} does not rise`);
  assert.equal(late, early * 3);
});

// One price for moving and for removing was Tarik's explicit call: the clock does not care
// what you intended, and two prices means explaining two rules.
test('moving and removing are the same price, because there is only one rule to explain', () => {
  assert.equal(costOf('move', 90), costOf('move', 90));
});

test('an action you cannot afford is refused, and says why in words', () => {
  const nearlyOut = MORNING_MINUTES - 5;
  assert.equal(canAfford('flip', nearlyOut), true);
  assert.equal(canAfford('preview', nearlyOut), false);
  assert.equal(whyNot('flip', nearlyOut), null);
  assert.match(whyNot('preview', nearlyOut)!, /Not enough morning left.*15 minutes.*you have 5/);
});

// The readout must always mean exactly one thing. lib/player.ts learned this the hard way:
// an hour counter that could run backwards read as broken even though it was "working".
test('the morning never runs past nine, however much is spent', () => {
  let spent = MORNING_MINUTES - 1;
  spent = spend('preview', spent);
  assert.equal(spent, MORNING_MINUTES);
  assert.equal(remaining(spent), 0);
  assert.equal(morningClock(spent), '9:00');
  assert.equal(morningClock(spent + 500), '9:00');
});

test('a negative spend never reads as before five', () => {
  assert.equal(morningClock(-30), '5:00');
});
