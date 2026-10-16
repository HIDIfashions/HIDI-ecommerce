"use client";

import { useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import { clampZoom, IMAGE_ZOOM_LEVELS, INITIAL_ZOOM, pinchZoom } from "@/lib/image-zoom";
import type { ZoomPoint, ZoomView } from "@/lib/image-zoom";

export function useImageZoom(onSwipe?: (direction: -1 | 1) => void) {
  const [view, setView] = useState<ZoomView>(INITIAL_ZOOM);
  const [dragging, setDragging] = useState(false);
  const current = useRef(view);
  const pointers = useRef(new Map<number, ZoomPoint>());
  const swipe = useRef<ZoomPoint | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);

  function update(next: ZoomView) {
    current.current = next;
    setView(next);
  }
  function reset() {
    pointers.current.clear();
    swipe.current = null;
    setDragging(false);
    update(INITIAL_ZOOM);
  }
  function setScale(scale: number) {
    const bounds = viewport.current?.getBoundingClientRect();
    const next = { ...current.current, scale };
    update(clampZoom(next, bounds?.width ?? 0, bounds?.height ?? 0));
  }
  function zoomIn() { setScale(IMAGE_ZOOM_LEVELS.find(level => level > current.current.scale + .001) ?? 4.2); }
  function zoomOut() { setScale([...IMAGE_ZOOM_LEVELS].reverse().find(level => level < current.current.scale - .001) ?? 1); }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    viewport.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    swipe.current = pointers.current.size === 1 && current.current.scale === 1 ? { x: event.clientX, y: event.clientY } : null;
    setDragging(current.current.scale > 1 || pointers.current.size > 1);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointers.current.get(event.pointerId);
    if (!start) return;
    const before = [...pointers.current.values()];
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const bounds = event.currentTarget.getBoundingClientRect();
    if (pointers.current.size === 2) {
      update(pinchZoom(current.current, before, [...pointers.current.values()], bounds));
    } else if (pointers.current.size === 1 && current.current.scale > 1) {
      update(clampZoom({ ...current.current, pan: { x: current.current.pan.x + event.clientX - start.x, y: current.current.pan.y + event.clientY - start.y } }, bounds.width, bounds.height));
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    if (!pointers.current.has(event.pointerId)) return;
    const start = swipe.current;
    pointers.current.delete(event.pointerId);
    swipe.current = null;
    setDragging(pointers.current.size > 0 && current.current.scale > 1);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && start && current.current.scale === 1) {
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.2) onSwipe?.(dx < 0 ? 1 : -1);
    }
  }
  return {
    zoom: view.scale, pan: view.pan, dragging, reset, zoomIn, zoomOut,
    handlers: {
      ref: viewport,
      onPointerDown: pointerDown,
      onPointerMove: pointerMove,
      onPointerUp: (event: PointerEvent<HTMLDivElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => finish(event, true),
      onWheel: (event: WheelEvent<HTMLDivElement>) => { event.preventDefault(); if (event.deltaY < 0) zoomIn(); else if (event.deltaY > 0) zoomOut(); },
      onDoubleClick: () => current.current.scale === 1 ? setScale(2.6) : reset(),
    },
  };
}
