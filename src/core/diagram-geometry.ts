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

  //클래스 다이어그램
  if (model.kind === 'class') {
    const keys = routeKeys(model.relations);

    //시작점, 끝점, 상자 넓이를 통해 상자 테두리 교차점을 연산
    //시작점과 끝점이 같은 경우 시작점 리턴
    function calculateIntersection(
      startX: number, startY: number,
      endX: number, endY: number,
      width: number, height: number
    ) {
      const dx = endX - startX;
      const dy = endY - startY;

      if (dx == 0 && dy == 0) {
        return {
          x: startX,
          y: startY
        }
      }

      const px = dx != 0 ? Math.abs(width / dx) : Infinity;
      const py = dy != 0 ? Math.abs(height / dy) : Infinity;
      const t = Math.min(px, py);
      const safeT = Number.isFinite(t) ? t : 0;
      return {
        x: startX + dx / 2 * safeT,
        y: startY + dy / 2 * safeT
      }
    }

    return model.relations.flatMap((edge, index) => {
      const a = layout[edge.from], b = layout[edge.to];
      if (!a || !b) return [];

      const startX = a.x + a.width / 2;
      const startY = a.y + a.height / 2;

      const endX = b.x + b.width / 2;
      const endY = b.y + b.height / 2;

      const nowRoute = routes.get(keys[index]);
      const routePoints = (nowRoute && nowRoute.length)
        ? nowRoute
        : edge.from === edge.to
          ? [
            { x: startX + a.width, y: startY },
            { x: startX + a.width, y: startY + a.height },
            { x: startX, y: startY + a.height }
          ]
          : [];


      const hasRoute = routePoints && routePoints.length > 0;

      const firstRoute = hasRoute ? routePoints[0] : { x: endX, y: endY };
      const lastRoute = hasRoute ? routePoints[routePoints.length - 1] : { x: startX, y: startY };

      const startPoint = calculateIntersection(
        startX, startY,
        firstRoute.x, firstRoute.y,
        a.width, a.height
      );

      const endPoint = calculateIntersection(
        endX, endY,
        lastRoute.x, lastRoute.y,
        b.width, b.height
      );

      return [{
        key: keys[index], label: edge.label, from: edge.from, to: edge.to,
        points: [
          startPoint,
          ...(routePoints ?? []),
          endPoint
        ],
        style: getEdgeStyle_ClassDiagram(edge.connector)
      }];
    });
  }

  //시퀸스 다이어그램
  else if (model.kind === 'sequence') {
    const keys = sequenceRouteKeys(model.steps);
    const positions = sequenceRowPositions(document);
    const offsets = readSequenceOffsets(document.source);
    let message = 0;

    const selfX = 35;
    const selfY = 25;

    return sequenceRows(model.steps).flatMap((row, index) => {
      if (!row.from || !row.to) return [];
      const key = keys[message++];
      const a = layout[row.from], b = layout[row.to];
      if (!a || !b) return [];
      const y = positions[index];

      const centerX = a.x + a.width / 2;
      const isSelfMessage = row.from === row.to;

      const nowRoute = routes.get(key) ?? [];

      const routePoints = nowRoute.length ?
        nowRoute
        : isSelfMessage ?
          [
            { x: centerX + selfX, y },
            { x: centerX + selfX, y: y + selfY },
          ] : [];

      const points = isSelfMessage ?
        [
          { x: centerX, y },
          ...routePoints,
          { x: centerX, y: y + selfY },
        ]
        : [
          { x: centerX, y },
          ...routePoints,
          { x: b.x + b.width / 2, y },
        ];

      return [{
        key, label: row.text, from: row.from, to: row.to,
        sequence: {
          offsetY: y - firstSequenceRow(layout) - index * 65, storedOffsetY: offsets.get(key) ?? 0,
          minY: index ? positions[index - 1] + 24 : sequenceContentTop(layout)
        },
        points: points,
        style: getEdgeStyle_SequenceDiagram((row.arrow ?? '->>') as MessageArrow)
      }];
    });
  }

  //미지원 다이어그램 유형
  else throw new Error('지원하지 않는 다이어그램 유형입니다.');
}

export function nearestPoint(point: BendPoint, a: BendPoint, b: BendPoint): BendPoint {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}
