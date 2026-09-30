export function wrapIndex(index, count) {
  if (!Number.isInteger(count) || count < 1) throw new Error('Carousel needs at least one item.');
  return ((index % count) + count) % count;
}
export function slideDelta(index, active, count) {
  let delta = wrapIndex(index - active, count);
  if (delta > Math.floor(count / 2)) delta -= count;
  return delta;
}
