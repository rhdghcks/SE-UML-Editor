// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState, useSyncExternalStore } from 'react';
import { DiagramCanvas } from '../../../src/ui/DiagramCanvas';
import { DiagramStore } from '../../../src/core/diagram-store';
import { writeRoute, writeSequenceOffset } from '../../../src/core/route-editing';
import { readRoutes, readSequenceOffsets } from '../../../src/core/manual-routes';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import type { BendPoint } from '../../../src/core/manual-routes';

// jsdom에는 SVG 좌표 변환과 포인터 캡처가 없다. 화면 좌표 = SVG 좌표(항등 변환)로 둔다.
beforeAll(() => {
  const identity = { inverse: () => identity };
  Object.defineProperty(SVGElement.prototype, 'getScreenCTM', { configurable: true, value: () => identity });
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true, value: () => ({ x: 60, y: 70, width: 480, height: 112 }),
  });
  Object.defineProperty(Element.prototype, 'setPointerCapture', { configurable: true, value: () => {} });
  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true, value(this: SVGElement) { return (this.textContent ?? '').length * 10; },
  });
  vi.stubGlobal('DOMPoint', class {
    constructor(public x = 0, public y = 0) {}
    matrixTransform() { return { x: this.x, y: this.y }; }
  });
});

const BOXES = {
  'class:A': { x: 60, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
  'class:B': { x: 350, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
};
const classSource = (code = 'classDiagram\nA --> B') =>
  `${code}\n%% @se-uml-layout ${JSON.stringify({ version: 1, nodes: BOXES })}`;

interface Options { disabled?: boolean; snap?: (point: BendPoint, id: string) => BendPoint; failRoute?: boolean }

/** App.tsx와 같은 방식으로 캔버스 콜백을 실제 DiagramStore에 연결한다. */
function setup(source = classSource(), options: Options = {}) {
  const store = new DiagramStore(new BasicMermaidParser(), new GridLayout(), source);
  const errors: string[] = [];
  const releases = { begun: 0, released: 0 };
  function Harness() {
    const document = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const [selected, setSelected] = useState<string | null>(null);
    return <DiagramCanvas document={document} disabled={options.disabled ?? false}
      onMove={store.moveNode} onResize={store.resizeNode}
      onRouteChange={(key, points, offsetY) => {
        if (options.failRoute) throw new Error('간선을 바꿀 수 없습니다.');
        let source = writeRoute(store.getSnapshot().source, key, points);
        if (offsetY !== undefined) source = writeSequenceOffset(source, key, offsetY);
        store.updateSource(source);
      }}
      onError={message => { if (message) errors.push(message); }}
      onInteractionStart={() => { releases.begun++; return () => { releases.released++; }; }}
      snapNode={options.snap ?? (point => point)}
      onChangeNodeColor={store.setNodeColor}/>;
  }
  const view = render(<Harness />);
  const svg = view.container.querySelector<SVGSVGElement>('svg.diagram-svg')!;
  const box = (id: string) => view.container.querySelector(`[data-node-id="${id}"] .node-box`)!;
  const at = (x: number, y: number, extra: object = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, ...extra });
  const drag = (target: Element, from: [number, number], to: [number, number]) => {
    fireEvent.pointerDown(target, at(...from));
    fireEvent.pointerMove(svg, at(...to));
    fireEvent.pointerUp(svg, at(...to));
  };
  const routes = () => readRoutes(store.getSnapshot().source);
  return { store, view, svg, box, at, drag, routes, errors, releases };
}

describe('DiagramCanvas ↔ DiagramStore 포인터 편집 [SPEC-2.1]', () => {
  it('노드를 드래그하면 스냅을 거친 좌표가 코드에 반영되고 Undo 한 번으로 돌아간다 [SPEC-3.2][SPEC-5.3]', () => {
    const snap = vi.fn((point: BendPoint) => ({ x: point.x - 5, y: point.y }));
    const { store, box, drag, releases } = setup(classSource(), { snap });
    drag(box('class:B'), [400, 100], [430, 140]);

    expect(snap).toHaveBeenLastCalledWith({ x: 380, y: 110 }, 'class:B');
    expect(store.getSnapshot().layout['class:B']).toMatchObject({ x: 375, y: 110, placement: 'manual' });
    expect(releases).toEqual({ begun: 1, released: 1 });
    store.undo();
    expect(store.getSnapshot().layout['class:B']).toMatchObject({ x: 350, y: 70 });
  });

  it('제자리 클릭·Escape·pointercancel·다른 포인터는 위치를 바꾸지 않는다', () => {
    const { store, svg, box, at, releases } = setup();
    const before = store.getSnapshot();

    fireEvent.pointerDown(box('class:A'), at(100, 100));
    fireEvent.pointerUp(svg, at(100.2, 100.2));
    fireEvent.pointerDown(box('class:A'), at(100, 100));
    fireEvent.pointerMove(svg, at(170, 170));
    fireEvent.keyDown(svg, { key: 'Escape' });
    fireEvent.pointerUp(svg, at(170, 170));
    fireEvent.pointerDown(box('class:A'), at(100, 100));
    fireEvent.pointerMove(svg, at(170, 170, { pointerId: 2 }));
    fireEvent.pointerCancel(svg, at(170, 170));
    fireEvent.pointerDown(box('class:A'), at(100, 100, { button: 2 }));

    expect(store.getSnapshot()).toBe(before);
    expect(releases).toEqual({ begun: 3, released: 3 });
  });

  it('선택한 노드의 크기 조절 핸들로 크기를 바꾸고 최소 크기 아래로 줄지 않는다 [SPEC-2.4]', () => {
    const { store, view, box, drag } = setup();
    fireEvent.pointerDown(box('class:A'), { clientX: 100, clientY: 100, pointerId: 1, button: 0 });
    fireEvent.pointerUp(view.container.querySelector('svg')!, { clientX: 100, clientY: 100, pointerId: 1 });
    const handle = screen.getByLabelText('A 크기 조절');

    drag(handle, [245, 177], [310, 240]);
    expect(store.getSnapshot().layout['class:A']).toMatchObject({ width: 255, height: 175 });
    drag(screen.getByLabelText('A 크기 조절'), [310, 240], [0, 0]);
    expect(store.getSnapshot().layout['class:A']).toMatchObject({ width: 80, height: 55 });
  });

  it('텍스트에 맞추기는 가장 긴 줄과 멤버 수로 크기를 정한다 [SPEC-2.4]', () => {
    const { store, box, svg, at } = setup(classSource('classDiagram\nclass A {\n+averyveryverylongattributename: string\n+save()\n}\nclass B'));
    expect(screen.getByRole('button', { name: '텍스트에 맞추기' })).toBeDisabled();
    fireEvent.pointerDown(box('class:A'), at(100, 100));
    fireEvent.pointerUp(svg, at(100, 100));
    fireEvent.click(screen.getByRole('button', { name: '텍스트에 맞추기' }));

    // 가장 긴 줄 39자 × 10 + 여백 24 = 414, 높이 60 + 멤버 2개 × 18 = 96
    expect(store.getSnapshot().layout['class:A']).toMatchObject({ width: 414, height: 96 });
  });
});

describe('DiagramCanvas 간선 편집 [SPEC-2.3]', () => {
  const handles = (container: HTMLElement) => container.querySelectorAll('.bend-handle');

  it('직선 드래그와 라벨 더블클릭은 점을 만들지 않고 선 더블클릭으로만 추가한다 [SPEC-2.2][SPEC-3.2]', () => {
    const { store, view, drag, routes, at } = setup(classSource('classDiagram\nA --> B : relation'));
    const before = store.getSnapshot().layout;
    drag(edgeOf(view.container), [300, 126], [300, 206]);
    fireEvent.doubleClick(view.container.querySelector('.canvas-edge text')!, at(300, 116));
    expect(routes().size).toBe(0);
    expect(handles(view.container)).toHaveLength(0);
    expect(screen.queryByRole('button', { name: '꺾임점 추가' })).toBeNull();
    fireEvent.doubleClick(edgeOf(view.container), at(280, 126));
    fireEvent.doubleClick(edgeOf(view.container), at(320, 126));
    drag(edgeOf(view.container), [300, 126], [300, 206]);

    const [[, points]] = [...routes()];
    expect(points).toHaveLength(2);
    expect(points.every(point => point.y > 126)).toBe(true);
    expect(store.getSnapshot().layout).toEqual(before);
    expect(handles(view.container)).toHaveLength(2);
  });

  it('꺾임점 이동·삭제·선 더블클릭 추가·초기화가 경로에 반영된다', () => {
    const { view, drag, routes, at, svg } = setup();
    // 브라우저 더블클릭은 먼저 pointerdown/up으로 선을 선택한다.
    drag(edgeOf(view.container), [280, 126], [280, 126]);
    fireEvent.doubleClick(edgeOf(view.container), at(280, 126));
    fireEvent.doubleClick(edgeOf(view.container), at(320, 126));
    const first = handles(view.container)[0];
    const cx = Number(first.getAttribute('cx')), cy = Number(first.getAttribute('cy'));

    drag(first, [cx, cy], [cx + 20, cy + 25]);
    expect([...routes().values()][0][0]).toEqual({ x: cx + 20, y: cy + 25 });

    fireEvent.click(screen.getByRole('button', { name: '꺾임점 삭제' }));
    expect([...routes().values()][0]).toHaveLength(1);
    expect(screen.getByRole('button', { name: '꺾임점 삭제' })).toBeDisabled();

    fireEvent.doubleClick(edgeOf(view.container), at(300, 126));
    expect([...routes().values()][0]).toHaveLength(2);

    fireEvent.doubleClick(edgeOf(view.container), at(300, 126));
    expect([...routes().values()][0]).toHaveLength(3);

    fireEvent.keyDown(svg, { key: 'Delete' });
    expect([...routes().values()][0]).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: '경로 초기화' }));
    // 초기화는 주석을 지우지 않고 꺾임점 없는 경로로 저장한다.
    expect([...routes().values()][0]).toEqual([]);
    expect(handles(view.container)).toHaveLength(0);
  });

  it('간선 변경이 거부되면 오류를 알리고 경로를 바꾸지 않는다 [SPEC-1.2]', () => {
    const { view, routes, errors, at } = setup(classSource(), { failRoute: true });
    fireEvent.doubleClick(edgeOf(view.container), at(300, 126));
    expect(errors).toEqual(['간선을 바꿀 수 없습니다.']);
    expect(routes().size).toBe(0);
  });
});

describe('시퀀스 화살표 수직 드래그 [SPEC-2.2]', () => {
  const code = 'sequenceDiagram\nUser->>Server: call\nactivate Server\nServer-->>User: reply\ndeactivate Server';
  const source = code + '\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes: {
    'participant:User': { ...BOXES['class:A'], height: 70 },
    'participant:Server': { ...BOXES['class:B'], height: 70 },
  } });
  it('직선 전체와 메시지 문구를 수직 이동하되 점을 만들지 않고 한 단계 Undo로 복구한다 [SPEC-5.3][SPEC-1.3]', () => {
    const { store, view, svg, at, drag } = setup(source);
    const edge = edgeOf(view.container);
    const layout = store.getSnapshot().layout;
    drag(edge, [300, 200], [340, 300]);
    expect(edge).toHaveAttribute('points', '155,300 445,300');
    expect(view.container.querySelectorAll('.bend-handle')).toHaveLength(0);
    expect(view.container.querySelector('.canvas-edge text')).toHaveAttribute('y', '290');
    expect(screen.getByText('activate: Server')).toHaveAttribute('y', '324');
    expect([...readSequenceOffsets(store.getSnapshot().source).values()]).toEqual([100]);
    expect(store.getSnapshot().layout).toEqual(layout);
    expect(store.getSnapshot().source.split('\n%%')[0]).toBe(code);
    const moved = store.getSnapshot();
    drag(edge, [300, 300], [380, 300]);
    expect(store.getSnapshot()).toBe(moved);
    act(() => store.undo());
    expect(edge).toHaveAttribute('points', '155,200 445,200');
    act(() => store.redo());
    expect(edge).toHaveAttribute('points', '155,300 445,300');
    fireEvent.pointerDown(edge, at(300, 300));
    fireEvent.pointerMove(svg, at(300, 350));
    expect(edge).toHaveAttribute('points', '155,350 445,350');
    fireEvent.keyDown(svg, { key: 'Escape' });
    fireEvent.pointerUp(svg, at(300, 350));
    expect(store.getSnapshot().source).toBe(moved.source);
    expect(edge).toHaveAttribute('points', '155,300 445,300');
  });

  it('꺾인 선도 같은 모양으로 이동하고 경로 초기화와 Undo가 높이·점을 함께 복구한다 [SPEC-2.3][SPEC-5.3]', () => {
    const { store, view, drag, at, svg } = setup(source);
    const edge = edgeOf(view.container);
    drag(edge, [300, 200], [300, 200]);
    fireEvent.doubleClick(edge, at(300, 200));
    const handle = view.container.querySelector('.bend-handle')!;
    drag(handle, [300, 200], [300, 225]);
    drag(edge, [227.5, 212.5], [307.5, 272.5]);
    expect(edge).toHaveAttribute('points', '155,260 300,285 445,260');
    expect(view.container.querySelectorAll('.bend-handle')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '경로 초기화' }));
    expect(edge).toHaveAttribute('points', '155,200 445,200');
    act(() => store.undo());
    expect(edge).toHaveAttribute('points', '155,260 300,285 445,260');
    // Another pointer and pointercancel never commit the temporary move.
    const before = store.getSnapshot();
    fireEvent.pointerDown(edge, at(227.5, 272.5));
    fireEvent.pointerMove(svg, at(227.5, 300, { pointerId: 2 }));
    fireEvent.pointerCancel(svg, at(227.5, 300));
    expect(store.getSnapshot()).toBe(before);
  });

  it('박스·앞 행을 넘지 않도록 제한하며 이동이 거부되면 오류를 알리고 원문을 유지한다 [SPEC-1.2]', () => {
    const { store, view, drag, errors } = setup(source, { failRoute: true });
    const before = store.getSnapshot();
    drag(edgeOf(view.container), [300, 200], [300, -500]);
    expect(errors).toEqual(['간선을 바꿀 수 없습니다.']);
    expect(store.getSnapshot()).toBe(before);
    expect(edgeOf(view.container)).toHaveAttribute('points', '155,200 445,200');
  });
});

describe('DiagramCanvas 상태 전이 [SPEC-1.2]', () => {
  it('비활성화되면 조작을 받지 않고 마지막 정상 문서를 계속 그린다', () => {
    const { store, box, drag, releases, view } = setup(classSource(), { disabled: true });
    const before = store.getSnapshot();
    drag(box('class:A'), [100, 100], [200, 200]);
    fireEvent.doubleClick(edgeOf(view.container), { clientX: 300, clientY: 126 });

    expect(store.getSnapshot()).toBe(before);
    expect(releases.begun).toBe(0);
    expect(view.container.querySelector('g.canvas-node.disabled')).not.toBeNull();
    for (const name of ['텍스트에 맞추기', '꺾임점 삭제', '경로 초기화']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('드래그 중 문서가 바뀌면 제스처를 취소하고 놓아도 반영하지 않는다 [SPEC-3.1]', () => {
    const { store, svg, box, at, releases } = setup();
    fireEvent.pointerDown(box('class:A'), at(100, 100));
    fireEvent.pointerMove(svg, at(150, 150));
    act(() => store.updateSource(classSource('classDiagram\nA --> B\nclass C')));
    fireEvent.pointerMove(svg, at(170, 170));
    fireEvent.pointerUp(svg, at(170, 170));

    expect(store.getSnapshot().layout['class:A']).toMatchObject({ x: 60, y: 70 });
    expect(releases).toEqual({ begun: 1, released: 1 });
  });

  it('시퀀스 다이어그램은 생명선과 블록 라벨을 그린다 [SPEC-1.3]', () => {
    const { view } = setup('sequenceDiagram\nparticipant A\nparticipant B\nloop retry\nA->>B: ping\nend');
    expect(view.container.querySelectorAll('line[stroke-dasharray="6 5"]')).toHaveLength(2);
    expect(screen.getByText('loop: retry')).toBeInTheDocument();
    expect(screen.getByText('ping')).toBeInTheDocument();
  });

  it('참여자 드래그 미리보기·취소와 크기 변경이 활성화·분기 설명 위치에 반영된다 [SPEC-2.1][SPEC-2.4][SPEC-1.3]', () => {
    const code = 'sequenceDiagram\nUser->>Server: call\nactivate Server\nServer-->>User: reply\ndeactivate Server\nalt valid\nUser->>Server: next\nelse expired\nServer-->>User: no\nend';
    const source = code + '\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes: {
      'participant:User': { ...BOXES['class:A'], height: 70 },
      'participant:Server': { ...BOXES['class:B'], height: 70 },
    } });
    const { store, svg, box, at, drag } = setup(source);
    const label = screen.getByText('activate: Server');
    expect(label).toHaveAttribute('x', '139');
    expect(label).toHaveAttribute('text-anchor', 'end');
    fireEvent.pointerDown(box('participant:User'), at(100, 100));
    fireEvent.pointerMove(svg, at(650, 100));
    expect(label).toHaveAttribute('x', '429');
    expect(screen.getByText('else: expired')).toHaveAttribute('x', '429');
    fireEvent.pointerCancel(svg, at(650, 100));
    expect(label).toHaveAttribute('x', '139');
    expect(store.getSnapshot().source).toBe(source);
    drag(box('participant:User'), [100, 100], [650, 100]);
    act(() => store.resizeNode('participant:Server', 230, 100));
    expect(label).toHaveAttribute('x', '449');
    expect(screen.getByText('deactivate: Server')).toHaveAttribute('x', '449');
    expect(screen.getByText('alt: valid')).toHaveAttribute('x', '449');
    expect(store.getSnapshot().source.split('\n%%')[0]).toBe(code);
  });
});

describe('DiagramCanvas 보기 조작과 문서 상태 연결 [SPEC-2.5]', () => {
  it('휠과 보기 버튼은 문서·Undo를 바꾸지 않고 배율 제한과 초기화를 적용한다', () => {
    const { store, svg } = setup();
    const before = store.getSnapshot();
    fireEvent.wheel(svg, { clientX: 300, clientY: 200, deltaY: -200, deltaMode: 0 });
    expect(screen.getByLabelText('캔버스 배율')).toHaveTextContent('135%');
    fireEvent.click(screen.getByRole('button', { name: '캔버스 확대' }));
    fireEvent.click(screen.getByRole('button', { name: '캔버스 축소' }));
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: -500 });
    expect(screen.getByLabelText('캔버스 배율')).toHaveTextContent('400%');
    expect(screen.getByRole('button', { name: '캔버스 확대' })).toBeDisabled();
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: 500, deltaMode: 1 });
    expect(screen.getByLabelText('캔버스 배율')).toHaveTextContent('25%');
    expect(screen.getByRole('button', { name: '캔버스 축소' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '보기 초기화' }));
    expect(screen.getByLabelText('캔버스 배율')).toHaveTextContent('178%');
    expect(store.getSnapshot()).toBe(before);
    expect(store.canUndo()).toBe(false);
  });

  it('화면 이동은 빈 공간 왼쪽·가운데 버튼으로 시작하고 취소·문서 교체·해제에서 배치 대기를 끝낸다', () => {
    const { store, svg, view, box, at, drag, releases } = setup();
    const world = view.container.querySelector('.canvas-world')!;
    const background = view.container.querySelector('.canvas-background')!;
    const before = store.getSnapshot();
    drag(background, [600, 200], [645, 230]);
    expect(world).toHaveAttribute('transform', 'translate(45 30) scale(1)');
    fireEvent.pointerDown(box('class:A'), at(100, 100, { button: 1 }));
    fireEvent.pointerMove(svg, at(150, 140));
    fireEvent.keyDown(svg, { key: 'Escape' });
    fireEvent.pointerUp(svg, at(150, 140));
    expect(world).toHaveAttribute('transform', 'translate(45 30) scale(1)');
    expect(store.getSnapshot()).toBe(before);
    fireEvent.pointerDown(background, at(600, 200));
    fireEvent.pointerMove(svg, at(650, 250, { pointerId: 2 }));
    fireEvent.wheel(svg, { deltaY: -200 });
    expect(world).toHaveAttribute('transform', 'translate(45 30) scale(1)');
    act(() => store.updateSource(classSource('classDiagram\nA --> B\nclass C')));
    expect(world).toHaveAttribute('transform', 'translate(45 30) scale(1)');
    fireEvent.pointerDown(background, at(600, 200));
    view.unmount();
    expect(releases).toEqual({ begun: 4, released: 4 });
  });
});

function edgeOf(container: HTMLElement) { return container.querySelector('g.canvas-edge .edge-line')!; }
