import { useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent } from 'react';
import type { DiagramDocument, NodeLayout } from '../core/types';
import type { BendPoint } from '../core/manual-routes';
import { canvasEdges, firstSequenceRow, nearestPoint, sequenceRows } from '../core/diagram-geometry';
import type { CanvasEdge } from '../core/diagram-geometry';
import { MAX_ZOOM, MIN_ZOOM, panViewport, zoomViewport } from './canvas-viewport';
import type { CanvasViewport } from './canvas-viewport';

interface Props {
  document: DiagramDocument;
  disabled: boolean;
  selected: string | null;
  onSelect(id: string): void;
  onMove(id: string, x: number, y: number): void;
  onResize(id: string, width: number, height: number): void;
  onRouteChange(key: string, points: BendPoint[]): void;
  onError(message: string): void;
  onInteractionStart(): () => void;
  snapNode(point: BendPoint, id: string): BendPoint;
}

type Preview = { kind: 'node'; id: string; box: NodeLayout } |
  { kind: 'route'; key: string; points: BendPoint[] };
interface Gesture {
  kind: 'node' | 'resize' | 'edge' | 'bend';
  pointerId: number;
  start: BendPoint;
  document: DiagramDocument;
  id: string;
  box?: NodeLayout;
  edge?: CanvasEdge;
  bend?: number;
  moved: boolean;
}
interface PanGesture {
  pointerId: number;
  start: BendPoint;
  view: CanvasViewport;
  document: DiagramDocument;
}

export function DiagramCanvas({ document, disabled, selected, onSelect, onMove, onResize,
  onRouteChange, onError, onInteractionStart, snapNode }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const canvasId = useId().replace(/:/g, '');
  const gesture = useRef<Gesture | null>(null);
  const pan = useRef<PanGesture | null>(null);
  const [panning, setPanning] = useState(false);
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef(viewport);
  const releaseInteraction = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedBend, setSelectedBend] = useState<number | null>(null);
  const validDocument = useRef(document);
  if (!disabled) validDocument.current = document;
  const shown = disabled ? validDocument.current : document;
  const { model, layout } = shown;
  const displayLayout = preview?.kind === 'node' ? { ...layout, [preview.id]: preview.box } : layout;
  const edges = canvasEdges({ ...shown, layout: displayLayout }).map(edge =>
    preview?.kind === 'route' && preview.key === edge.key
      ? { ...edge, points: [edge.points[0], ...preview.points, edge.points.at(-1)!] } : edge);
  const activeEdge = edges.find(edge => edge.key === selectedEdge);
  const nodes = model.kind === 'class' ? model.nodes : model.participants;
  const rows = model.kind === 'sequence' ? sequenceRows(model.steps) : [];
  // A fixed viewBox during a gesture prevents the coordinate system moving under the pointer.
  const savedEdges = canvasEdges(shown);
  const points = savedEdges.flatMap(edge => edge.points);
  const width = Math.max(900, ...Object.values(layout).map(box => box.x + box.width + 60), ...points.map(p => p.x + 32));
  const height = Math.max(480, ...Object.values(layout).map(box => box.y + box.height + 100),
    ...points.map(p => p.y + 40), model.kind === 'sequence' ? firstSequenceRow(layout) + rows.length * 65 : 0);

  function releaseLayout() {
    const release = releaseInteraction.current;
    releaseInteraction.current = null;
    release?.();
  }
  function setView(view: CanvasViewport) { viewportRef.current = view; setViewport(view); }
  function cancel() {
    if (pan.current) setView(pan.current.view);
    pan.current = null; setPanning(false);
    gesture.current = null; setPreview(null); releaseLayout();
  }
  useEffect(() => {
    if (disabled || (gesture.current && gesture.current.document !== document) ||
        (pan.current && pan.current.document !== document)) cancel();
  }, [document, disabled]);
  useEffect(() => () => { gesture.current = null; pan.current = null; releaseLayout(); }, []);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      if (gesture.current || pan.current) return;
      const point = rootPoint(event.clientX, event.clientY);
      if (!point) return;
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientHeight : 1);
      setView(zoomViewport(viewportRef.current, point, Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.0015)));
    }
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  useEffect(() => {
    if (!savedEdges.some(edge => edge.key === selectedEdge)) { setSelectedEdge(null); setSelectedBend(null); }
  }, [document, selectedEdge]);
  function safely(action: () => void) {
    try { action(); onError(''); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  }
  function svgPoint(clientX: number, clientY: number): BendPoint | null {
    const matrix = world.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
  }
  function rootPoint(clientX: number, clientY: number): BendPoint | null {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
  }
  function beginPan(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current || pan.current) return;
    const background = event.target === event.currentTarget ||
      (event.target instanceof SVGElement && event.target.classList.contains('canvas-background'));
    if (event.button !== 1 && !(event.button === 0 && background)) return;
    const start = rootPoint(event.clientX, event.clientY);
    if (!start) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    releaseInteraction.current = onInteractionStart();
    pan.current = { pointerId: event.pointerId, start, view: viewportRef.current, document };
    setPanning(true); setSelectedEdge(null); setSelectedBend(null);
  }
  function zoom(factor: number) {
    if (gesture.current || pan.current) return;
    setView(zoomViewport(viewportRef.current, { x: width / 2, y: height / 2 }, factor));
  }
  function begin(event: PointerEvent<SVGElement>, data: Omit<Gesture, 'pointerId' | 'start' | 'document' | 'moved'>) {
    if (disabled || event.button !== 0 || gesture.current || pan.current) return;
    const start = svgPoint(event.clientX, event.clientY);
    if (!start) return;
    event.stopPropagation(); event.preventDefault();
    svg.current?.focus({ preventScroll: true });
    // A straight line can be selected, but only a line double-click may create bends.
    if (data.kind === 'edge' && data.edge?.points.length === 2) {
      setSelectedEdge(data.id); setSelectedBend(null); return;
    }
    // Keep click/double-click targeted at the line, rather than retargeting them to its group.
    const capture = data.kind === 'edge' && event.target instanceof SVGElement ? event.target : event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    releaseInteraction.current = onInteractionStart();
    gesture.current = { ...data, start, pointerId: event.pointerId, document, moved: false };
    if (data.kind === 'node' || data.kind === 'resize') {
      onSelect(data.id); setSelectedEdge(null); setSelectedBend(null);
    } else { setSelectedEdge(data.id); setSelectedBend(data.bend ?? null); }
  }
  function calculate(current: Gesture, point: BendPoint): Preview {
    const dx = point.x - current.start.x, dy = point.y - current.start.y;
    if (current.kind === 'node' && current.box) {
      const position = snapNode({ x: Math.round(Math.max(0, current.box.x + dx)),
        y: Math.round(Math.max(0, current.box.y + dy)) }, current.id);
      return { kind: 'node', id: current.id, box: { ...current.box, ...position } };
    }
    if (current.kind === 'resize' && current.box) {
      return { kind: 'node', id: current.id, box: { ...current.box,
        width: Math.round(Math.max(80, current.box.width + dx)),
        height: Math.round(Math.max(55, current.box.height + dy)) } };
    }
    const edge = current.edge!;
    let bends = edge.points.slice(1, -1).map(p => ({ ...p }));
    if (current.kind === 'bend' && current.bend !== undefined) {
      bends[current.bend] = { x: Math.max(0, bends[current.bend].x + dx), y: Math.max(0, bends[current.bend].y + dy) };
    } else {
      const offsetX = Math.max(dx, -Math.min(...bends.map(p => p.x)));
      const offsetY = Math.max(dy, -Math.min(...bends.map(p => p.y)));
      bends = bends.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
    }
    return { kind: 'route', key: edge.key, points: bends };
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    const movingView = pan.current;
    if (movingView?.pointerId === event.pointerId) {
      const point = rootPoint(event.clientX, event.clientY);
      if (point) setView(panViewport(movingView.view, { x: point.x - movingView.start.x, y: point.y - movingView.start.y }));
      return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (disabled || current.document !== document) { cancel(); return; }
    safely(() => {
      const point = svgPoint(event.clientX, event.clientY);
      if (!point) return;
      current.moved ||= Math.hypot(point.x - current.start.x, point.y - current.start.y) > 0.5;
      if (current.moved) setPreview(calculate(current, point));
    });
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    const movingView = pan.current;
    if (movingView?.pointerId === event.pointerId) {
      const point = rootPoint(event.clientX, event.clientY);
      if (point) setView(panViewport(movingView.view, { x: point.x - movingView.start.x, y: point.y - movingView.start.y }));
      pan.current = null; setPanning(false); releaseLayout(); return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    try {
      if (disabled || current.document !== document) return;
      safely(() => {
        const point = svgPoint(event.clientX, event.clientY);
        if (!point || (!current.moved && Math.hypot(point.x - current.start.x, point.y - current.start.y) <= 0.5)) return;
        const result = calculate(current, point);
        if (result.kind === 'route') onRouteChange(result.key, result.points);
        else if (current.kind === 'resize') onResize(result.id, result.box.width, result.box.height);
        else if (result.box.x !== current.box?.x || result.box.y !== current.box?.y) onMove(result.id, result.box.x, result.box.y);
      });
    } finally { cancel(); }
  }
  function addBend(edge: CanvasEdge, point: BendPoint) {
    const bends = edge.points.slice(1, -1).map(p => ({ ...p }));
    let index = 0, best = Infinity, added = edge.points[0];
    for (let i = 1; i < edge.points.length; i++) {
      const a = edge.points[i - 1], b = edge.points[i];
      const candidate = nearestPoint(point, a, b);
      const score = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (score < best) { best = score; index = i - 1; added = candidate; }
    }
    bends.splice(index, 0, added);
    safely(() => onRouteChange(edge.key, bends)); setSelectedBend(index);
  }
  function deleteBend() {
    if (!activeEdge || selectedBend === null) return;
    const bends = activeEdge.points.slice(1, -1); bends.splice(selectedBend, 1);
    safely(() => onRouteChange(activeEdge.key, bends)); setSelectedBend(null);
  }
  function fitText() {
    const node = nodes.find(item => item.id === selected);
    if (!node) return;
    const element = svg.current?.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`);
    const lengths = [...(element?.querySelectorAll<SVGTextElement>('text[data-content]') ?? [])].map(text => text.getComputedTextLength());
    const count = node.kind === 'class' ? node.attributes.length + node.methods.length : 0;
    safely(() => onResize(node.id, Math.ceil(Math.max(100, ...lengths.map(length => length + 24))),
      node.kind === 'class' ? Math.max(75, 60 + count * 18) : 70));
  }
  return <div className="canvas-editor">
    <div className="canvas-tools">
      <span>휠: 확대·축소 · 빈 공간 드래그: 화면 이동 · 선 더블클릭: 꺾임점 추가 · Esc: 취소</span>
      <button aria-label="캔버스 축소" disabled={viewport.scale <= MIN_ZOOM} onClick={() => zoom(1 / 1.2)}>−</button>
      <output className="canvas-zoom" aria-label="캔버스 배율">{Math.round(viewport.scale * 100)}%</output>
      <button aria-label="캔버스 확대" disabled={viewport.scale >= MAX_ZOOM} onClick={() => zoom(1.2)}>+</button>
      <button onClick={() => { cancel(); setView({ x: 0, y: 0, scale: 1 }); }}>보기 초기화</button>
      <button disabled={disabled || !selected || Boolean(selectedEdge)} onClick={fitText}>텍스트에 맞추기</button>
      <button disabled={disabled || !activeEdge || selectedBend === null} onClick={deleteBend}>꺾임점 삭제</button>
      <button disabled={disabled || !activeEdge || activeEdge.points.length === 2}
        onClick={() => activeEdge && safely(() => { onRouteChange(activeEdge.key, []); setSelectedBend(null); })}>경로 초기화</button>
    </div>
    <svg ref={svg} className={panning ? 'diagram-svg is-panning' : 'diagram-svg'} tabIndex={0} aria-label="다이어그램 편집 캔버스"
      viewBox={`0 0 ${width} ${height}`} onPointerDown={beginPan} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId || pan.current?.pointerId === event.pointerId) cancel(); }}
      onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId || pan.current?.pointerId === event.pointerId) cancel(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); cancel(); }
        if (!disabled && event.key === 'Delete' && selectedBend !== null) { event.preventDefault(); deleteBend(); }
      }}>
      <defs><marker id={`${canvasId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#596579" /></marker></defs>
      <rect className="canvas-background" width={width} height={height} fill="white" />
      <g ref={world} className="canvas-world" transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
      {edges.map(edge => {
        const middle = edge.points[Math.floor(edge.points.length / 2)];
        const label = edge.points.length === 2 ? { x: (edge.points[0].x + edge.points[1].x) / 2, y: (edge.points[0].y + edge.points[1].y) / 2 } : middle;
        const pointString = edge.points.map(p => `${p.x},${p.y}`).join(' ');
        const doubleClickLine = (event: ReactMouseEvent<SVGPolylineElement>) => {
            if (disabled) return;
            event.stopPropagation(); const point = svgPoint(event.clientX, event.clientY);
            if (point) addBend(edge, point);
        };
        return <g key={edge.key} data-route-key={edge.key} className="canvas-edge"
          onPointerDown={event => begin(event, { kind: 'edge', id: edge.key, edge })}>
          <polyline className="edge-hit" points={pointString} fill="none" stroke="transparent" strokeWidth="14" onDoubleClick={doubleClickLine} />
          <polyline className="edge-line" points={pointString} fill="none" stroke={selectedEdge === edge.key ? '#3367d6' : '#596579'}
            strokeWidth="2" markerEnd={`url(#${canvasId}-arrow)`} onDoubleClick={doubleClickLine} />
          <text x={label.x} y={label.y - 10} textAnchor="middle" fontSize="15">{edge.label}</text>
          {selectedEdge === edge.key && edge.points.slice(1, -1).map((point, index) =>
            <circle key={index} className="bend-handle" aria-label={`꺾임점 ${index + 1}`} cx={point.x} cy={point.y} r="7"
              fill={selectedBend === index ? '#ffbd59' : 'white'} stroke="#3367d6" strokeWidth="2"
              onPointerDown={event => begin(event, { kind: 'bend', id: edge.key, edge, bend: index })}
              onDoubleClick={event => event.stopPropagation()} />)}
        </g>;
      })}
      {model.kind === 'sequence' && model.participants.map(participant => {
        const box = displayLayout[participant.id];
        return box && <line key={participant.id} x1={box.x + box.width / 2} y1={box.y + box.height}
          x2={box.x + box.width / 2} y2={height - 35} stroke="#9da7b6" strokeDasharray="6 5" pointerEvents="none" />;
      })}
      {model.kind === 'sequence' && rows.map((row, index) => !row.from &&
        <text key={row.id} x={30 + row.depth * 12} y={firstSequenceRow(displayLayout) + index * 65} fontSize="16" pointerEvents="none">{row.text}</text>)}
      {nodes.map((node, index) => {
        const box = displayLayout[node.id];
        if (!box) return null;
        const active = selected === node.id && !selectedEdge;
        const details = node.kind === 'class' ? [...node.attributes, ...node.methods] : [];
        const clipId = `${canvasId}-node-${index}`;
        const foreground = box.color === '#000000' ? 'white' : '#253149';
        return <g key={node.id} data-node-id={node.id} className={disabled ? 'canvas-node disabled' : 'canvas-node'}
          onPointerDown={event => begin(event, { kind: 'node', id: node.id, box: layout[node.id] })}>
          <rect className="node-box" x={box.x} y={box.y} width={box.width} height={box.height} rx="4"
            fill={box.color} stroke={active ? '#3367d6' : '#526078'} strokeWidth={active ? 3 : 1.5} />
          <clipPath id={clipId}><path d={`M${box.x + 4},${box.y + 4}h${Math.max(1, box.width - 8)}v${Math.max(1, box.height - 8)}h${-Math.max(1, box.width - 8)}z`} /></clipPath>
          <g clipPath={`url(#${clipId})`} pointerEvents="none">
            <text data-content x={box.x + box.width / 2} y={box.y + 30} textAnchor="middle" fontSize="20" fontWeight="600" fill={foreground}>
              {node.kind === 'class' ? node.name : node.displayName}</text>
            {node.kind === 'class' && <>
              <line x1={box.x} y1={box.y + 43} x2={box.x + box.width} y2={box.y + 43} stroke="#9da7b6" />
              {details.map((line, i) => <text data-content key={i} x={box.x + 12} y={box.y + 65 + i * 18} fontSize="13" fill={foreground}>{line}</text>)}
            </>}
          </g>
          {active && !disabled && <path className="resize-handle" aria-label={`${node.name} 크기 조절`}
            d={`M${box.x + box.width - 12},${box.y + box.height - 12}h12v12h-12z`} fill="#3367d6"
            onPointerDown={event => begin(event, { kind: 'resize', id: node.id, box: layout[node.id] })} />}
        </g>;
      })}
      </g>
    </svg>
  </div>;
}
