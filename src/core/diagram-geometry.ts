import type { DiagramDocument, LayoutMap, SequenceStep } from './types';
import { readRoutes, routeKeys } from './manual-routes';
import type { BendPoint } from './manual-routes';

export interface SequenceRow {
  id: string;
  from?: string;
  to?: string;
  arrow?: string;
  text: string;
  depth: number;
}

export function sequenceRows(steps: SequenceStep[], depth = 0): SequenceRow[] {
  return steps.flatMap((step): SequenceRow[] => {
    if (step.kind === 'message') return [{ ...step, depth }];
    if (step.kind === 'activation') return [{ id: step.id, depth,
      text: `${step.action}: ${step.target.replace(/^participant:/, '')}` }];
    return step.branches.flatMap((branch, index) => [{
      id: `${step.id}:${index}`, depth,
      text: `${index ? (step.operator === 'critical' ? 'option' : 'else') : step.operator}: ${branch.label}`,
    }, ...sequenceRows(branch.steps, depth + 1)]);
  });
}

export function sequenceRouteKeys(steps: SequenceStep[]): string[] {
  const counts = new Map<string, number>();
  return sequenceRows(steps).filter(row => row.from && row.to).map(row => {
    const family = JSON.stringify([row.from, row.arrow, row.to]);
    const index = counts.get(family) ?? 0;
    counts.set(family, index + 1);
    return JSON.stringify([row.from, row.arrow, row.to, index]);
  });
}

export interface CanvasEdge {
  key: string;
  label: string;
  from: string;
  to: string;
  points: BendPoint[];
}

export function firstSequenceRow(layout: LayoutMap): number {
  return Math.max(200, ...Object.values(layout).map(node => node.y + node.height + 60));
}

export function canvasEdges(document: DiagramDocument): CanvasEdge[] {
  const { model, layout } = document;
  const routes = readRoutes(document.source);
  if (model.kind === 'class') {
    const keys = routeKeys(model.relations);
    return model.relations.flatMap((edge, index) => {
      const a = layout[edge.from], b = layout[edge.to];
      if (!a || !b) return [];
      return [{ key: keys[index], label: edge.label, from: edge.from, to: edge.to,
        points: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 },
          ...(routes.get(keys[index]) ?? []), { x: b.x + b.width / 2, y: b.y + b.height / 2 }] }];
    });
  }
  const keys = sequenceRouteKeys(model.steps);
  let message = 0;
  return sequenceRows(model.steps).flatMap((row, index) => {
    if (!row.from || !row.to) return [];
    const key = keys[message++];
    const a = layout[row.from], b = layout[row.to];
    if (!a || !b) return [];
    const y = firstSequenceRow(layout) + index * 65;
    return [{ key, label: row.text, from: row.from, to: row.to,
      points: [{ x: a.x + a.width / 2, y }, ...(routes.get(key) ?? []), { x: b.x + b.width / 2, y }] }];
  });
}

export function nearestPoint(point: BendPoint, a: BendPoint, b: BendPoint): BendPoint {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
