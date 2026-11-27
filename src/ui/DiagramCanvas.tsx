import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent } from 'react';
import type { DiagramDocument, NodeLayout } from '../core/types';
import type { BendPoint } from '../core/manual-routes';
import { canvasEdges, firstSequenceRow, nearestPoint, sequenceLabelPosition, sequenceRowPositions, sequenceRows } from '../core/diagram-geometry';
import type { CanvasEdge } from '../core/diagram-geometry';
import { writeRoute, writeSequenceOffset } from '../core/route-editing';
import type { EdgeStyle } from '../core/edge-style';
import { MAX_ZOOM, MIN_ZOOM, fitViewport, panViewport, zoomViewport } from './canvas-viewport';
import type { CanvasViewport } from './canvas-viewport';

interface Props {
  document: DiagramDocument;
  disabled: boolean;
  onMove(id: string, x: number, y: number): void;
  onResize(id: string, width: number, height: number): void;
  onRouteChange(key: string, points: BendPoint[], offsetY?: number): void;
  onError(message: string): void;
  onInteractionStart(): () => void;
  snapNode(point: BendPoint, id: string): BendPoint;
  onChangeNodeColor(id: string, color: string): void;
}

type Preview = { kind: 'node'; id: string; box: NodeLayout } |
{ kind: 'route'; key: string; points: BendPoint[]; offsetY?: number };
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

const COLORS = ['#000000', '#ffffff', '#e8eefb', '#dff2e5', '#fff0ce', '#f9dfdf', '#e9ddf7'];

export function DiagramCanvas({ document, disabled, onMove, onResize,
  onRouteChange, onError, onInteractionStart, snapNode, onChangeNodeColor }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const currentNode = selected ? document.layout[selected] : undefined;

  const svg = useRef<SVGSVGElement>(null);
  const world = useRef<SVGGElement>(null);
  const canvasId = useId().replace(/:/g, '');
  const gesture = useRef<Gesture | null>(null);
  const pan = useRef<PanGesture | null>(null);
  const [panning, setPanning] = useState(false);
  const [viewport, setViewport] = useState<CanvasViewport>({ x: 0, y: 0, scale: 1 });
  const viewportRef = useRef(viewport);
  const [fitRequest, requestFit] = useState(0);
  const releaseInteraction = useRef<(() => void) | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [selectedBend, setSelectedBend] = useState<number | null>(null);
  const validDocument = useRef(document);
  if (!disabled) validDocument.current = document;
  const shown = disabled ? validDocument.current : document;
  const { model, layout } = shown;
  const displayLayout = preview?.kind === 'node' ? { ...layout, [preview.id]: preview.box } : layout;
  let displaySource = preview?.kind === 'route' ? writeRoute(shown.source, preview.key, preview.points) : shown.source;
  if (preview?.kind === 'route' && preview.offsetY !== undefined) {
    displaySource = writeSequenceOffset(displaySource, preview.key, preview.offsetY);
  }
  const displayDocument = { ...shown, layout: displayLayout, source: displaySource };
  const edges = canvasEdges(displayDocument);
  const activeEdge = edges.find(edge => edge.key === selectedEdge);
  const nodes = model.kind === 'class' ? model.nodes : model.participants;
  const rows = model.kind === 'sequence' ? sequenceRows(model.steps) : [];
  const rowPositions = sequenceRowPositions(displayDocument);
  // Reserve space to the left without changing any persisted participant/message coordinates.
  // Use conservative Arial 16px character widths; the SVG export uses the same gutter.
  const leftGutter = Math.max(0, ...rows.flatMap((row, index) => {
    const label = sequenceLabelPosition(row, index, layout);
    if (!label) return [];
    const textWidth = row.text.split('').reduce((width, char) => width +
      (/[ilI.,:;!'| ]/.test(char) ? 6 : /[ftr()\[\]]/.test(char) ? 8 :
        /[WMm@%]/.test(char) ? 17 : /[A-Zw]/.test(char) ? 14 : char.charCodeAt(0) > 127 ? 20 : 11), 0);
    return [textWidth + 16 - label.x];
  }));
  // A fixed viewBox during a gesture prevents the coordinate system moving under the pointer.
  const savedEdges = canvasEdges(shown);
  const points = savedEdges.flatMap(edge => edge.points);
  const width = Math.max(900, ...Object.values(layout).map(box => box.x + box.width + 60), ...points.map(p => p.x + 32)) + leftGutter;
  const height = Math.max(480, ...Object.values(layout).map(box => box.y + box.height + 100),
    ...points.map(p => p.y + 40), model.kind === 'sequence'
    ? (sequenceRowPositions(shown).at(-1) ?? firstSequenceRow(layout)) + 65 : 0);

  function releaseLayout() {
    const release = releaseInteraction.current;
    releaseInteraction.current = null;
    release?.();
  }
  function setView(view: CanvasViewport) { viewportRef.current = view; setViewport(view); }
  useLayoutEffect(() => {
    if (!fitRequest || !world.current) return;
    // Measure after cancelling a gesture has removed its temporary preview from the DOM.
    const element = world.current;
    const transform = element.getAttribute('transform');
    // Text metrics can vary slightly with zoom. Measure at the same transform each time.
    element.removeAttribute('transform');
    let bounds: DOMRect;
    try { bounds = element.getBBox(); }
    finally { if (transform !== null) element.setAttribute('transform', transform); }
    setView(fitViewport({ x: bounds.x + leftGutter, y: bounds.y, width: bounds.width, height: bounds.height }, { width, height }));
  }, [fitRequest]);
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
    // Sequence arrows move vertically without creating bends. Straight class edges are selection-only.
    if (data.kind === 'edge') {
      setSelected(null);
      if(!data.edge?.sequence && data.edge?.points.length === 2) {
        setSelectedEdge(data.id); setSelectedBend(null); return;
      }
    }
    // Keep click/double-click targeted at the line, rather than retargeting them to its group.
    const capture = event.target instanceof SVGElement ? event.target : event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    releaseInteraction.current = onInteractionStart();
    gesture.current = { ...data, start, pointerId: event.pointerId, document, moved: false };
    if (data.kind === 'node' || data.kind === 'resize') {
      setSelected(data.id); setSelectedEdge(null); setSelectedBend(null);
    } else { setSelectedEdge(data.id); setSelectedBend(data.bend ?? null); }
  }
  function calculate(current: Gesture, point: BendPoint): Preview {
    const dx = point.x - current.start.x, dy = point.y - current.start.y;
    if (current.kind === 'node' && current.box) {
      const position = snapNode({
        x: Math.round(Math.max(0, current.box.x + dx)),
        y: Math.round(Math.max(0, current.box.y + dy))
      }, current.id);
      return { kind: 'node', id: current.id, box: { ...current.box, ...position } };
    }
    if (current.kind === 'resize' && current.box) {
      return {
        kind: 'node', id: current.id, box: {
          ...current.box,
          width: Math.round(Math.max(80, current.box.width + dx)),
          height: Math.round(Math.max(55, current.box.height + dy))
        }
      };
    }
    const edge = current.edge!;
    let bends = edge.points.slice(1, -1).map(p => ({ ...p }));
    if (current.kind === 'edge' && edge.sequence) {
      const delta = Math.max(Math.round(edge.points[0].y + dy) - edge.points[0].y, edge.sequence.minY - edge.points[0].y,
        bends.length ? -Math.min(...bends.map(point => point.y)) : -Infinity);
      return {
        kind: 'route', key: edge.key, points: bends.map(p => ({ x: p.x, y: p.y + delta })),
        offsetY: delta === 0 ? undefined : edge.sequence.offsetY + delta
      };
    }
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
      current.moved ||= (current.kind === 'edge' && current.edge?.sequence
        ? Math.abs(point.y - current.start.y) : Math.hypot(point.x - current.start.x, point.y - current.start.y)) > 0.5;
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
        if (!point || (!current.moved && (current.kind === 'edge' && current.edge?.sequence
          ? Math.abs(point.y - current.start.y) : Math.hypot(point.x - current.start.x, point.y - current.start.y)) <= 0.5)) return;
        const result = calculate(current, point);
        if (result.kind === 'route') {
          if (result.offsetY === undefined && JSON.stringify(result.points) === JSON.stringify(current.edge?.points.slice(1, -1))) return;
          onRouteChange(result.key, result.points, result.offsetY);
        }
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


  const MARKER_PATHS = {
    arrow: 'M 0 0 L 10 5 L 0 10 L 10 5 z',
    triangle: 'M 0 0 L 10 5 L 0 10 z',
    diamond: 'M 0 5 L 5 0 L 10 5 L 5 10 z',
  } as const;

  const MARKERS = {
    none: undefined,
    arrow: 'arrow',
    triangleEmpty: 'triangle-empty',
    triangleFilled: 'triangle-filled',
    diamondEmpty: 'diamond-empty',
    diamondFilled: 'diamond-filled',
  } as const;

  function createMarker(
    id: string,
    path: string,
    filled: 'fill' | 'clear' | 'none'
  ) {
    return (
      <marker
        id={`${canvasId}-${id}`}
        viewBox="0 0 10 10"
        refX="10"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path
          d={path}
          fill={
            filled === 'fill' ? '#596579' :
              filled === 'clear' ? 'white' :
                'none'
          }
          stroke="#596579"
          strokeWidth={1.2}
        />
      </marker>
    );
  }


  function getMarkerId(style: EdgeStyle) {
    switch (style.marker) {
      case 'none':
        return MARKERS.none;

      case 'arrow':
        return MARKERS.arrow;

      case 'triangle':
        return style.markerFill
          ? MARKERS.triangleFilled
          : MARKERS.triangleEmpty;

      case 'diamond':
        return style.markerFill
          ? MARKERS.diamondFilled
          : MARKERS.diamondEmpty;
    }
  }

  function drawEdge(edge: CanvasEdge) {
    //label : 꺾임점중 이름을 띄울 위치
    const middle = edge.points[Math.floor(edge.points.length / 2)];
    const label = edge.points.length === 2 ? { x: (edge.points[0].x + edge.points[1].x) / 2, y: (edge.points[0].y + edge.points[1].y) / 2 } : middle;

    //꺾임점들의 좌표들를 polyline에 맞는 문법으로 변환
    const pointString = edge.points.map(p => `${p.x},${p.y}`).join(' ');

    //더블클릭(꺾임점 생성) 동작 인식 함수
    const doubleClickLine = (event: ReactMouseEvent<SVGPolylineElement>) => {
      if (disabled) return;
      event.stopPropagation(); const point = svgPoint(event.clientX, event.clientY);
      if (point) addBend(edge, point);
    };

    //끝점 형태 정의를 url로 전환
    const markerURL = `url(#${canvasId}-${getMarkerId(edge.style)})`

    return (
      <g key={edge.key} data-route-key={edge.key} className="canvas-edge"
        onPointerDown={event => begin(event, { kind: 'edge', id: edge.key, edge })}>

        {/* 클릭 감지용 선 */}
        <polyline className="edge-hit"
          points={pointString}
          fill="none"
          stroke="transparent" strokeWidth="14"
          onDoubleClick={doubleClickLine} />

        {/* 실제 보이는 선 */}
        <polyline className="edge-line"
          points={pointString}
          fill="none"
          stroke={selectedEdge === edge.key ? '#3367d6' : '#596579'}
          strokeWidth="2"
          strokeDasharray={edge.style.type == 'dashed' ? "6 5" : undefined}
          {...(edge.style.markerPosition === 'start'
            ? { markerStart: markerURL }
            : { markerEnd: markerURL })}
          onDoubleClick={doubleClickLine} />

        {/* 이름 텍스트 */}
        <text x={label.x} y={label.y - 10} textAnchor="middle" fontSize="15">{edge.label}</text>

        {/* 꺾임점 */}
        {selectedEdge === edge.key && edge.points.slice(1, -1).map((point, index) =>
          <circle key={index} className="bend-handle" aria-label={`꺾임점 ${index + 1}`} cx={point.x} cy={point.y} r="7"
            fill={selectedBend === index ? '#ffbd59' : 'white'} stroke="#3367d6" strokeWidth="2"
            onPointerDown={event => begin(event, { kind: 'bend', id: edge.key, edge, bend: index })}
            onDoubleClick={event => event.stopPropagation()} />)}
      </g>);
  }

  return (
    <div className="canvas-editor">
      <div className="canvas-tools">
        <span>휠: 확대·축소 · 빈 공간 드래그: 화면 이동 · 시퀀스 선 드래그: 위아래 이동 · 선 더블클릭: 꺾임점 추가 · Esc: 취소</span>
        <button aria-label="캔버스 축소" disabled={viewport.scale <= MIN_ZOOM} onClick={() => zoom(1 / 1.2)}>−</button>
        <output className="canvas-zoom" aria-label="캔버스 배율">{Math.round(viewport.scale * 100)}%</output>
        <button aria-label="캔버스 확대" disabled={viewport.scale >= MAX_ZOOM} onClick={() => zoom(1.2)}>+</button>
        <button onClick={() => { cancel(); requestFit(value => value + 1); }}>보기 초기화</button>
        <button disabled={disabled || !selected || Boolean(selectedEdge)} onClick={fitText}>텍스트에 맞추기</button>
        <button disabled={disabled || !activeEdge || selectedBend === null} onClick={deleteBend}>꺾임점 삭제</button>
        <button disabled={disabled || !activeEdge || (activeEdge.points.length === 2 && !activeEdge.sequence?.storedOffsetY)}
          onClick={() => activeEdge && safely(() => {
            onRouteChange(activeEdge.key, [], activeEdge.sequence ? 0 : undefined); setSelectedBend(null);
          })}>경로 초기화</button>
      </div>

      <div className="selection-bar">
        {selected && currentNode ? <>
          <span>선택: {selected}</span>
          <span>색상</span>
          {COLORS.map((color) => <button key={color} className="swatch"
            title={color} style={{ backgroundColor: color }} disabled={disabled}
            onClick={() => onChangeNodeColor(selected, color)} />)}
        </> : <span>노드를 선택하면 색상을 바꿀 수 있습니다.</span>}
      </div>

      <svg ref={svg} className={panning ? 'diagram-svg is-panning' : 'diagram-svg'} tabIndex={0} aria-label="다이어그램 편집 캔버스"
        viewBox={`0 0 ${width} ${height}`} onPointerDown={beginPan} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={event => { if (gesture.current?.pointerId === event.pointerId || pan.current?.pointerId === event.pointerId) cancel(); }}
        onLostPointerCapture={event => { if (gesture.current?.pointerId === event.pointerId || pan.current?.pointerId === event.pointerId) cancel(); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); cancel(); }
          if (!disabled && event.key === 'Delete' && selectedBend !== null) { event.preventDefault(); deleteBend(); }
        }}>
        <defs>
          {createMarker(MARKERS.arrow, MARKER_PATHS.arrow, 'none')}
          {createMarker(MARKERS.triangleEmpty, MARKER_PATHS.triangle, 'clear')}
          {createMarker(MARKERS.triangleFilled, MARKER_PATHS.triangle, 'fill')}
          {createMarker(MARKERS.diamondEmpty, MARKER_PATHS.diamond, 'clear')}
          {createMarker(MARKERS.diamondFilled, MARKER_PATHS.diamond, 'fill')}
        </defs>
        <rect className="canvas-background" width={width} height={height} fill="white" />

        <g ref={world} className="canvas-world" transform={`translate(${viewport.x + leftGutter * viewport.scale} ${viewport.y}) scale(${viewport.scale})`}>

          {/* 모든 관계선 */}
          {edges.map(edge => drawEdge(edge))}

          {/* 시퀸스 다이어그램 steps 줄 */}
          {model.kind === 'sequence' && model.participants.map(participant => {
            const box = displayLayout[participant.id];
            return box && <line key={participant.id} x1={box.x + box.width / 2} y1={box.y + box.height}
              x2={box.x + box.width / 2} y2={height - 35} stroke="#9da7b6" strokeDasharray="6 5" pointerEvents="none" />;
          })}

          {/* 시퀸스 다이어그램의 라벨(좌측 텍스트) */}
          {model.kind === 'sequence' && rows.map((row, index) => {
            const label = sequenceLabelPosition(row, index, displayLayout, rowPositions[index]);
            return label && <text key={row.id} className="sequence-annotation" data-sequence-row-id={row.id}
              data-target-id={row.target} x={label.x} y={label.y} textAnchor={label.textAnchor}
              fontSize="16" pointerEvents="none">{row.text}</text>;
          })}

          {/* 모든 노드 */}
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
    </div>
  );
}
