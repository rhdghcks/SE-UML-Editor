export interface CanvasViewport { x: number; y: number; scale: number }
export interface ViewPoint { x: number; y: number }

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;

/** Anchor is in root SVG coordinates; the same world point stays under the cursor. */
export function zoomViewport(view: CanvasViewport, anchor: ViewPoint, factor: number): CanvasViewport {
  if (![view.x, view.y, view.scale, anchor.x, anchor.y, factor].every(Number.isFinite) || view.scale <= 0 || factor <= 0) {
    throw new RangeError('확대 배율과 좌표가 올바르지 않습니다.');
  }
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.scale * factor));
  const ratio = scale / view.scale;
  return { scale, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio };
}

export function panViewport(view: CanvasViewport, delta: ViewPoint): CanvasViewport {
  return { ...view, x: view.x + delta.x, y: view.y + delta.y };
}
