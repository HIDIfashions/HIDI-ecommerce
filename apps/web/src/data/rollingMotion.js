/** Frame-rate independent, critically damped motion. No overshoot or timer resets. */
export function springStep(position, velocity, target, seconds, frequency = 13) {
  const dt = Math.max(0, Math.min(seconds, 0.064));
  const offset = position - target;
  const impulse = velocity + frequency * offset;
  const decay = Math.exp(-frequency * dt);
  return {
    position: target + (offset + impulse * dt) * decay,
    velocity: (velocity - frequency * impulse * dt) * decay,
  };
}

export function circularDistance(index, phase, count) {
  return ((index - phase + count / 2) % count + count) % count - count / 2;
}

const smoothstep = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

/** A shallow rolling arc, not a spinning card. Far-side wrapping happens at
 * zero opacity, while each real photograph keeps the same DOM/compositor layer. */
export function rollingPose(index, phase, count, width, height, stepRatio) {
  const relative = circularDistance(index, phase, count);
  const distance = Math.abs(relative);
  const scale = 0.62 + 0.38 * Math.exp(-0.65 * distance * distance);
  const drop = 0.162 * (1 - Math.exp(-0.95 * distance * distance));
  const fade = 1 - 0.59 * smoothstep(distance - 1);
  // Disappear before the circular distance changes sign at count / 2.
  const wrapFade = 1 - smoothstep((distance - (count / 2 - 0.48)) / 0.32);
  return {
    x: relative * width * stepRatio,
    y: drop * height,
    scale,
    rotate: -relative * 3.2,
    opacity: distance >= count / 2 - 0.16 ? 0 : fade * wrapFade,
    z: Math.round(1000 - distance * 100),
    distance,
  };
}
