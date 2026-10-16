export type ZoomPoint = { x: number; y: number };
export type ZoomView = { scale: number; pan: ZoomPoint };
export const IMAGE_ZOOM_LEVELS = [1, 1.8, 2.6, 3.4, 4.2] as const;
export const INITIAL_ZOOM: ZoomView = { scale: 1, pan: { x: 0, y: 0 } };

export function clampZoom(view: ZoomView, width: number, height: number): ZoomView {
  const scale = Math.max(1, Math.min(4.2, view.scale));
  if (scale === 1) return INITIAL_ZOOM;
  const xLimit = Math.max(0, width * (scale - 1) / 2);
  const yLimit = Math.max(0, height * (scale - 1) / 2);
  return { scale, pan: { x: Math.max(-xLimit, Math.min(xLimit, view.pan.x)), y: Math.max(-yLimit, Math.min(yLimit, view.pan.y)) } };
}

export function pinchZoom(view: ZoomView, before: ZoomPoint[], after: ZoomPoint[], bounds: { left: number; top: number; width: number; height: number }): ZoomView {
  const distance = (points: ZoomPoint[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  const oldDistance = distance(before);
  if (oldDistance < 1) return view;
  const scale = Math.max(1, Math.min(4.2, view.scale * distance(after) / oldDistance));
  const ratio = scale / view.scale;
  const center = (points: ZoomPoint[]) => ({ x: (points[0].x + points[1].x) / 2 - bounds.left - bounds.width / 2, y: (points[0].y + points[1].y) / 2 - bounds.top - bounds.height / 2 });
  const oldCenter = center(before), nextCenter = center(after);
  // Keep the inspected detail beneath the fingers as they move and separate.
  return clampZoom({ scale, pan: { x: nextCenter.x - (oldCenter.x - view.pan.x) * ratio, y: nextCenter.y - (oldCenter.y - view.pan.y) * ratio } }, bounds.width, bounds.height);
}
