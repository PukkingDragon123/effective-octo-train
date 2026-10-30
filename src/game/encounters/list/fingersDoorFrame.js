// Ride 2: long grey fingers curl over the rear-left window frame from the roof while the car
// moves; they tighten when you look at them, then slide away.
import { createWindowGhost } from '../../../creatures/index.js';
import { S } from '../helpers.js';

export async function run(E) {
  const seat = S.passengerSeat(E.ctx);
  const pane = E.ctx.pane || (seat === 'rearRight' ? 'rr' : 'rl');
  const w = E.track(createWindowGhost({}));
  w.humanoid.setVisible(false);
  E.event('encounter:fingersDoorFrame');
  await w.perform('fingersDoorFrame', { taxi: E.taxi, pane, duration: E.duration, along: 0.22 });
}
