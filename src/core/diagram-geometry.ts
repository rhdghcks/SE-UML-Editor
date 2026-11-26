import type { DiagramDocument, LayoutMap, SequenceStep, MessageArrow } from './types';
import {
  getEdgeStyle_ClassDiagram,
  getEdgeStyle_SequenceDiagram
} from './edge-style';

import type { EdgeStyle } from './edge-style';
import { readRoutes, readSequenceOffsets, routeKeys } from './manual-routes';
import type { BendPoint } from './manual-routes';

export interface SequenceRow {
  id: string;
  from?: string;
  to?: string;
  arrow?: string;
  target?: string;
  participants?: string[];
  text: string;
  depth: number;
}

export function sequenceRows(steps: SequenceStep[], depth = 0): SequenceRow[] {
  return steps.flatMap((step): SequenceRow[] => {
    if (step.kind === 'message') return [{ ...step, depth }];
    if (step.kind === 'activation') return [{
      id: step.id, depth, target: step.target,
      text: `${step.action}: ${step.target.replace(/^participant:/, '')}`
    }];
    const branches = step.branches.map(branch => ({ ...branch, rows: sequenceRows(branch.steps, depth + 1) }));
    const participants = [...new Set(branches.flatMap(branch => branch.rows.flatMap(row =>
      row.from && row.to ? [row.from, row.to] : row.target ? [row.target] : [])))];
    return branches.flatMap((branch, index) => [{
      id: `${step.id}:${index}`, depth, participants,
      text: `${index ? (step.operator === 'critical' ? 'option' : 'else') : step.operator}: ${branch.label}`,
    }, ...branch.rows]);
  });
}

export interface SequenceLabelPosition extends BendPoint { textAnchor: 'start' | 'end' }

/** Annotations end before the leftmost lifeline, so even long labels never cross a line. */
export function sequenceLabelPosition(row: SequenceRow, index: number, layout: LayoutMap,
  y = firstSequenceRow(layout) + index * 65): SequenceLabelPosition | undefined {
  if (row.from) return undefined;
  if (row.target && !layout[row.target]) return undefined;
  if (row.participants?.length && !row.participants.some(id => layout[id])) return undefined;
  const boxes = Object.values(layout);
  if (!boxes.length) return undefined;
  return { x: Math.min(...boxes.map(box => box.x + box.width / 2)) - 16, y, textAnchor: 'end' };
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
  style: EdgeStyle;
  sequence?: { offsetY: number; storedOffsetY: number; minY: number };
}

export function firstSequenceRow(layout: LayoutMap): number {
  return Math.max(200, ...Object.values(layout).map(node => node.y + node.height + 60));
}

export function sequenceRowPositions(document: DiagramDocument): number[] {
  if (document.model.kind !== 'sequence') return [];
  const rows = sequenceRows(document.model.steps);
  const keys = sequenceRouteKeys(document.model.steps);
  const offsets = readSequenceOffsets(document.source);
  const first = firstSequenceRow(document.layout);
  let message = 0, minimum = sequenceContentTop(document.layout);
  return rows.map((row, index) => {
    const offset = row.from && row.to ? offsets.get(keys[message++]) ?? 0 : 0;
    const y = Math.max(minimum, first + index * 65 + offset);
    // Move later rows only when needed to preserve message/activation/block order.
    minimum = y + 24;
    return y;
  });
}

function sequenceContentTop(layout: LayoutMap): number {
  return Math.max(0, ...Object.values(layout).map(box => box.y + box.height)) + 24;
}

export function canvasEdges(document: DiagramDocument): CanvasEdge[] {
  const { model, layout } = document;
  const routes = readRoutes(document.source);
  if (model.kind === 'class') {
    const keys = routeKeys(model.relations);
    return model.relations.flatMap((edge, index) => {
      const a = layout[edge.from], b = layout[edge.to];
      if (!a || !b) return [];
      return [{
        key: keys[index], label: edge.label, from: edge.from, to: edge.to,
        points: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 },
        ...(routes.get(keys[index]) ?? []), { x: b.x + b.width / 2, y: b.y + b.height / 2 }],
        style: getEdgeStyle_ClassDiagram(edge.connector)
      }];
    });
  }
  const keys = sequenceRouteKeys(model.steps);
  const positions = sequenceRowPositions(document);
  const offsets = readSequenceOffsets(document.source);
  let message = 0;
  return sequenceRows(model.steps).flatMap((row, index) => {
    if (!row.from || !row.to) return [];
    const key = keys[message++];
    const a = layout[row.from], b = layout[row.to];
    if (!a || !b) return [];
    const y = positions[index];
    return [{
      key, label: row.text, from: row.from, to: row.to,
      sequence: {
        offsetY: y - firstSequenceRow(layout) - index * 65, storedOffsetY: offsets.get(key) ?? 0,
        minY: index ? positions[index - 1] + 24 : sequenceContentTop(layout)
      },
      points: [{ x: a.x + a.width / 2, y }, ...(routes.get(key) ?? []), { x: b.x + b.width / 2, y }],
      style: getEdgeStyle_SequenceDiagram((row.arrow ?? '->>') as MessageArrow)
    }];
  });
}

export function nearestPoint(point: BendPoint, a: BendPoint, b: BendPoint): BendPoint {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
