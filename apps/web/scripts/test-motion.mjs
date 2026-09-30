import assert from 'node:assert/strict';
import { circularDistance, rollingPose, springStep } from '../src/data/rollingMotion.js';
for (const hz of [30, 60, 90, 120, 144]) {
  let x = 0, v = 0, previous = 0;
  for (let frame = 0; frame < hz * 2; frame += 1) {
    ({ position: x, velocity: v } = springStep(x, v, 1, 1 / hz));
    assert.ok(x >= previous - 1e-10 && x <= 1 + 1e-10, `No overshoot at ${hz} Hz`);
    previous = x;
  }
  assert.ok(Math.abs(1 - x) < 1e-6);
}
const resultAt = (hz) => {
  let state = { position: 0, velocity: 0 };
  for (let i = 0; i < hz; i++) state = springStep(state.position, state.velocity, 1, 1 / hz);
  return state.position;
};
assert.ok(Math.abs(resultAt(60) - resultAt(120)) < 1e-9, 'Frame-rate independent trajectory');
for (let phase = -10; phase <= 10; phase += .025) {
  for (let index = 0; index < 5; index++) {
    const pose = rollingPose(index, phase, 5, 500, 705, .73);
    const loop = rollingPose(index, phase + 5, 5, 500, 705, .73);
    assert.ok(Object.values(pose).every(Number.isFinite));
    assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    assert.ok(Math.abs(pose.x - loop.x) < 1e-8);
    assert.ok(Math.abs(pose.opacity - loop.opacity) < 1e-8);
    if (Math.abs(circularDistance(index, phase, 5)) > 2.34) assert.equal(pose.opacity, 0, 'Wrap is invisible');
  }
}
assert.equal(rollingPose(1, 1, 5, 500, 705, .73).scale, 1);
console.log('PASS: smooth rolling math, 30–144 Hz, no overshoot, seamless wrapping.');
