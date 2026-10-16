import assert from "node:assert/strict";
import test from "node:test";
import { clampZoom, INITIAL_ZOOM, pinchZoom } from "../apps/web/lib/image-zoom.js";
const bounds = { left: 0, top: 0, width: 400, height: 600 };
test("two fingers smoothly enlarge and reduce the image", () => {
  const before = [{ x: 150, y: 300 }, { x: 250, y: 300 }];
  const after = [{ x: 100, y: 300 }, { x: 300, y: 300 }];
  const large = pinchZoom(INITIAL_ZOOM, before, after, bounds);
  assert.equal(large.scale, 2); assert.deepEqual(large.pan, { x: 0, y: 0 });
  assert.deepEqual(pinchZoom(large, after, before, bounds), INITIAL_ZOOM);
});
test("pinch follows an off-centre detail instead of jumping to the middle", () => {
  const view = pinchZoom(INITIAL_ZOOM, [{ x: 200, y: 300 }, { x: 300, y: 300 }], [{ x: 150, y: 300 }, { x: 350, y: 300 }], bounds);
  assert.equal(view.scale, 2); assert.equal(view.pan.x, -50);
});
test("pinch and pan stay bounded and reset at 100 percent", () => {
  assert.deepEqual(clampZoom({ scale: .1, pan: { x: 900, y: -900 } }, 400, 600), INITIAL_ZOOM);
  const view = clampZoom({ scale: 8, pan: { x: 900, y: -9000 } }, 400, 600);
  assert.equal(view.scale, 4.2); assert.equal(view.pan.x, 640); assert.equal(view.pan.y, -960);
});
test("coincident touches never produce an infinite scale", () => {
  assert.equal(pinchZoom(INITIAL_ZOOM, [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 100, y: 0 }], bounds), INITIAL_ZOOM);
});
