export interface CanvasViewport { x: number; y: number; scale: number }
export interface ViewPoint { x: number; y: number }
export interface ViewBounds extends ViewPoint { width: number; height: number }

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

/** Fit all rendered content, including labels, in root SVG coordinates. */
export function fitViewport(bounds: ViewBounds, frame: Pick<ViewBounds, 'width' | 'height'>, padding = 24): CanvasViewport {
  if (![bounds.x, bounds.y, bounds.width, bounds.height, frame.width, frame.height, padding].every(Number.isFinite) ||
      bounds.width < 0 || bounds.height < 0 || padding < 0 || frame.width <= padding * 2 || frame.height <= padding * 2) {
    throw new RangeError('전체 보기의 영역과 여백이 올바르지 않습니다.');
  }
  if (!bounds.width && !bounds.height) return { x: 0, y: 0, scale: 1 };
  // Unlike manual zoom, fit may go below MIN_ZOOM to keep very large diagrams fully visible.
  const scale = Math.min(MAX_ZOOM, (frame.width - padding * 2) / Math.max(1, bounds.width),
    (frame.height - padding * 2) / Math.max(1, bounds.height));
  return { scale, x: frame.width / 2 - (bounds.x + bounds.width / 2) * scale,
    y: frame.height / 2 - (bounds.y + bounds.height / 2) * scale };
}
