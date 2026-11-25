import type { ISnapStrategy, LayoutChange } from '../core/contracts';
import type { DiagramDocument, LayoutMap } from '../core/types';
import { canvasEdges, nearestPoint } from '../core/diagram-geometry';

/** Eight SVG units by default; configurable until the customer's snap rule is agreed. */
export class AlignmentSnap implements ISnapStrategy {
  enabled = true;
  constructor(private readonly document: () => DiagramDocument, readonly distance = 8) {
    if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('스냅 거리는 양수여야 합니다.');
  }

  snap(point: LayoutChange, id: string, layout: LayoutMap): LayoutChange {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('좌표가 올바르지 않습니다.');
    const moving = layout[id];
    if (!this.enabled || !moving) return { ...point };
    let x = point.x, y = point.y, bestX = Infinity, bestY = Infinity;
    for (const [otherId, box] of Object.entries(layout)) {
      if (otherId === id) continue;
      // Only nearby boxes participate, so distant nodes do not act like magnets.
      if (point.x > box.x + box.width + this.distance || point.x + moving.width < box.x - this.distance ||
          point.y > box.y + box.height + this.distance || point.y + moving.height < box.y - this.distance) continue;
      for (const a of [0, moving.width / 2, moving.width]) {
        for (const b of [box.x, box.x + box.width / 2, box.x + box.width]) {
          const delta = b - (point.x + a);
          if (Math.abs(delta) <= this.distance && Math.abs(delta) < bestX) { bestX = Math.abs(delta); x = point.x + delta; }
        }
      }
      for (const a of [0, moving.height / 2, moving.height]) {
        for (const b of [box.y, box.y + box.height / 2, box.y + box.height]) {
          const delta = b - (point.y + a);
          if (Math.abs(delta) <= this.distance && Math.abs(delta) < bestY) { bestY = Math.abs(delta); y = point.y + delta; }
        }
      }
    }
    const center = { x: point.x + moving.width / 2, y: point.y + moving.height / 2 };
    let edgeDistance = Infinity;
    const nodeDistance = Number.isFinite(bestX) || Number.isFinite(bestY) ? Math.hypot(x - point.x, y - point.y) : Infinity;
    for (const edge of canvasEdges(this.document())) {
      if (edge.from === id || edge.to === id) continue;
      for (let i = 1; i < edge.points.length; i++) {
        const target = nearestPoint(center, edge.points[i - 1], edge.points[i]);
        const distance = Math.hypot(target.x - center.x, target.y - center.y);
        if (distance <= this.distance && distance < edgeDistance && distance < nodeDistance) {
          edgeDistance = distance;
          x = target.x - moving.width / 2;
          y = target.y - moving.height / 2;
        }
      }
    }
    return { x: Math.max(0, x), y: Math.max(0, y) };
  }
}
