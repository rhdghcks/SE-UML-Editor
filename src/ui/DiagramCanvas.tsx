import { readRoutes, routeKeys } from '../core/manual-routes';
import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type {
  DiagramDocument, NodeLayout, SequenceStep,
} from '../core/types';

interface Props {
  document: DiagramDocument;
  disabled: boolean;
  selected: string | null;
  onSelect(id: string): void;
  onMove(id: string, x: number, y: number): void;
}

interface DragStart {
  id: string;
  clientX: number;
  clientY: number;
  initialX: number;
  initialY: number;
}

function sequenceRows(steps: SequenceStep[], depth = 0): Array<{
  from?: string; to?: string; text: string; depth: number;
}> {
  const result: Array<{ from?: string; to?: string; text: string; depth: number }> = [];
  for (const step of steps) {
    if (step.kind === 'message') {
      result.push({ from: step.from, to: step.to, text: step.text, depth });
    } else if (step.kind === 'block') {
      for (const [index, branch] of step.branches.entries()) {
        result.push({ text: `${index ? (step.operator === 'critical' ? 'option' : 'else') : step.operator}: ${branch.label}`, depth });
        result.push(...sequenceRows(branch.steps, depth + 1));
      }
    } else {
      result.push({ text: `${step.action}: ${step.target.replace(/^participant:/, '')}`, depth });
    }
  }
  return result;
}

export function DiagramCanvas({ document, disabled, selected, onSelect, onMove }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const [preview, setPreview] = useState<{ id: string; x: number; y: number } | null>(null);
  const { model, layout } = document;
  const nodes = model.kind === 'class' ? model.nodes : model.participants;
  // 오류 초안은 마지막 정상 모델과 함께 전달되므로 경로도 정상 소스에서 읽는다.
  const routes = useRef(new Map<string, { x: number; y: number }[]>());
  if (!disabled && model.kind === 'class') routes.current = readRoutes(document.source);
  const keys = model.kind === 'class' ? routeKeys(model.relations) : [];
  const rows = model.kind === 'sequence' ? sequenceRows(model.steps) : [];
  const bends = keys.flatMap(key => routes.current.get(key) ?? []);
  const maxNodeX = Math.max(800, ...Object.values(layout).map((node) => node.x + node.width + 60));
  const width = Math.max(900, maxNodeX, ...bends.map(p => p.x + 32));
  const firstRow = Math.max(200, ...Object.values(layout).map(node => node.y + node.height + 60));
  const height = model.kind === 'sequence'
    ? Math.max(460, firstRow + rows.length * 65)
    : Math.max(480, ...bends.map(p => p.y + 32), ...Object.values(layout).map((node) => node.y + node.height + 100));

  const position = (id: string): NodeLayout | undefined => {
    const item = layout[id];
    return preview?.id === id && item ? { ...item, x: preview.x, y: preview.y } : item;
  };

  const startDrag = (event: PointerEvent<SVGGElement>, id: string) => {
    if (disabled || !layout[id]) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { id, clientX: event.clientX, clientY: event.clientY,
      initialX: layout[id].x, initialY: layout[id].y };
    onSelect(id);
  };

  const moveDrag = (event: PointerEvent<SVGGElement>) => {
    const start = dragStart.current;
    if (!start || !svg.current) return;
    const transform = svg.current.getScreenCTM();
    if (!transform) return;
    const inverse = transform.inverse();
    const startPoint = new DOMPoint(start.clientX, start.clientY).matrixTransform(inverse);
    const pointer = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse);
    const x = Math.max(0, start.initialX + pointer.x - startPoint.x);
    const y = Math.max(0, start.initialY + pointer.y - startPoint.y);
    setPreview({ id: start.id, x: Math.round(x), y: Math.round(y) });
  };

  const finishDrag = () => {
    if (!disabled && dragStart.current && preview && preview.id === dragStart.current.id) {
      const original = layout[preview.id];
      if (original && (original.x !== preview.x || original.y !== preview.y)) {
        onMove(preview.id, preview.x, preview.y);
      }
    }
    dragStart.current = null;
    setPreview(null);
  };

  return (
    <svg ref={svg} className="diagram-svg" viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#596579" />
        </marker>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {model.kind === 'class' && model.relations.map((relation, index) => {
        const from = position(relation.from);
        const to = position(relation.to);
        if (!from || !to) return null;
        const x1 = from.x + from.width / 2;
        const y1 = from.y + from.height / 2;
        const x2 = to.x + to.width / 2;
        const y2 = to.y + to.height / 2;
        return <g key={relation.id}>
          <polyline fill="none" points={[{ x: x1, y: y1 }, ...(routes.current.get(keys[index]) ?? []),
            { x: x2, y: y2 }].map(p => `${p.x},${p.y}`).join(' ')}
            stroke="#596579" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8}
            fontSize="15" textAnchor="middle" fill="#394253">{relation.label}</text>
        </g>;
      })}
      {model.kind === 'sequence' && model.participants.map((participant) => {
        const item = position(participant.id);
        if (!item) return null;
        return <line key={`lifeline:${participant.id}`} x1={item.x + item.width / 2}
          y1={item.y + item.height} x2={item.x + item.width / 2} y2={height - 35}
          stroke="#9da7b6" strokeDasharray="6 5" strokeWidth="1.5" />;
      })}
      {model.kind === 'sequence' && rows.map((row, index) => {
        const y = firstRow + index * 65;
        if (!row.from || !row.to) return <text key={index} x="30" y={y}
          fontSize="16" fill="#6c7291">{'  '.repeat(row.depth)}{row.text}</text>;
        const from = position(row.from);
        const to = position(row.to);
        if (!from || !to) return null;
        const x1 = from.x + from.width / 2;
        const x2 = to.x + to.width / 2;
        return <g key={index}>
          <line x1={x1} y1={y} x2={x2} y2={y}
            stroke="#596579" strokeWidth="2" markerEnd="url(#arrow)" />
          <text x={(x1 + x2) / 2} y={y - 11} textAnchor="middle"
            fontSize="16" fill="#303a50">{row.text}</text>
        </g>;
      })}
      {nodes.map((node) => {
        const item = position(node.id);
        if (!item) return null;
        const active = selected === node.id;
        const details = node.kind === 'class' ? [...node.attributes, ...node.methods] : [];
        return <g key={node.id}
          className={disabled ? 'canvas-node disabled' : 'canvas-node'}
          onPointerDown={(event) => startDrag(event, node.id)}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={() => { dragStart.current = null; setPreview(null); }}>
          <rect x={item.x} y={item.y} width={item.width} height={item.height}
            rx="4" fill={item.color} stroke={active ? '#3367d6' : '#526078'}
            strokeWidth={active ? 3 : 1.5} />
          <text x={item.x + item.width / 2} y={item.y + 30} textAnchor="middle"
            fontSize="20" fontWeight="600" fill={item.color === '#000000' ? '#ffffff' : '#253149'}>
            {node.kind === 'class' ? node.name : node.displayName}
          </text>
          {node.kind === 'class' && <>
            <line x1={item.x} y1={item.y + 43} x2={item.x + item.width}
              y2={item.y + 43} stroke="#9da7b6" />
            {details.slice(0, 3).map((line, i) =>
              <text key={i} x={item.x + 12} y={item.y + 65 + i * 17}
                fontSize="13" fill={item.color === '#000000' ? '#ffffff' : '#394253'}>{line}</text>)}
          </>}
        </g>;
      })}
    </svg>
  );
}
