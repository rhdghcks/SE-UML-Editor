import { expect, it, vi } from 'vitest';
import { writeRoute, writeSequenceOffset } from '../../../src/core/route-editing';
import { readRoutes, readSequenceOffsets, routeKeys } from '../../../src/core/manual-routes';
import { sequenceRouteKeys, canvasEdges } from '../../../src/core/diagram-geometry';
import { DiagramStore } from '../../../src/core/diagram-store';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';

const parser = new BasicMermaidParser();
it('upserts one route while retaining source, CRLF, node metadata and unrelated routes [SPEC-2.3][SPEC-3.2]', () => {
  const code = 'classDiagram\r\nA --> B  \r\n%% 메모';
  const a = writeRoute(code, 'a', [{ x: 1, y: 2 }]);
  const b = writeRoute(a, 'b', [{ x: 4, y: 5 }]);
  const next = writeRoute(b, 'a', [{ x: 7, y: 8 }]);
  expect(next.startsWith(code)).toBe(true);
  expect(next.match(/@se-uml-route/g)).toHaveLength(2);
  expect(readRoutes(next).get('b')).toEqual([{ x: 4, y: 5 }]);
  expect(writeRoute(next, 'a', [{ x: 7, y: 8 }])).toBe(next);
  expect(readRoutes(writeRoute(next, 'a', [])).get('a')).toEqual([]);
  expect(() => writeRoute(next, 'a', [{ x: NaN, y: 0 }])).toThrow();
});

it('수직 높이와 꺾임점을 독립적으로 기록하고 원문·CRLF·다른 경로를 보존한다 [SPEC-2.2][SPEC-2.3][SPEC-3.2]', () => {
  const code = 'sequenceDiagram\r\nA->>B: call  \r\n%% 메모';
  const prior = writeRoute(code, 'other', [{ x: 1, y: 2 }]);
  const moved = writeSequenceOffset(prior, 'message', 100);
  expect(moved.startsWith(code)).toBe(true);
  expect(readRoutes(moved).get('message')).toEqual([]);
  const bent = writeRoute(moved, 'message', [{ x: 250, y: 400 }]);
  expect(readSequenceOffsets(bent).get('message')).toBe(100);
  const changed = writeSequenceOffset(bent, 'message', 42);
  expect(readRoutes(changed).get('message')).toEqual([{ x: 250, y: 400 }]);
  expect(readRoutes(changed).get('other')).toEqual([{ x: 1, y: 2 }]);
  expect(writeSequenceOffset(changed, 'message', 42)).toBe(changed);
  expect(readSequenceOffsets(writeSequenceOffset(changed, 'message', 0)).get('message')).toBe(0);
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(() => writeSequenceOffset(changed, 'message', value)).toThrow(TypeError);
  }
  expect(() => writeSequenceOffset(changed, '', 1)).toThrow(TypeError);
  expect(() => readRoutes('%% @se-uml-route {"key":"a","points":[],"offsetY":"bad"}')).toThrow();
});

it('화살표 높이는 한 단계 Undo·Redo와 코드 재편집·재열기에 보존되고 손상된 파일은 거부한다 [SPEC-2.2][SPEC-5.3][SPEC-5.2][SPEC-1.2]', () => {
  const source = 'sequenceDiagram\nA->>B: call\nactivate B\nB-->>A: reply\ndeactivate B';
  const store = new DiagramStore(parser, new GridLayout(), source);
  const model = store.getSnapshot().model;
  if (model.kind !== 'sequence') throw new Error('Expected sequence');
  const key = sequenceRouteKeys(model.steps)[0];
  const listener = vi.fn(); store.subscribe(listener);
  store.updateSource(writeSequenceOffset(source, key, 100));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(canvasEdges(store.getSnapshot())[0].points[0].y).toBe(300);
  store.undo(); expect(readSequenceOffsets(store.getSnapshot().source).has(key)).toBe(false);
  store.redo(); expect(readSequenceOffsets(store.getSnapshot().source).get(key)).toBe(100);
  store.updateSource(source + '\n%% extra');
  expect(readSequenceOffsets(store.getSnapshot().source).get(key)).toBe(100);
  store.openSource(store.getPersistedSource());
  expect(canvasEdges(store.getSnapshot())[0].points[0].y).toBe(300);
  const before = store.getSnapshot();
  const corrupt = source + '\n%% @se-uml-route ' + JSON.stringify({ key, points: [], offsetY: 'bad' });
  expect(() => store.openSource(corrupt)).toThrow();
  expect(store.getSnapshot()).toBe(before);
});
it.each([
  'classDiagram\nA --> B',
  'sequenceDiagram\ncritical main\nA->>B: request\noption retry\nB-->>A: wait\nend',
])('routes have one undo entry and survive code edits and reload [SPEC-2.3][SPEC-5.3][SPEC-5.2]: %s', source => {
  const store = new DiagramStore(parser, new GridLayout(), source);
  const model = store.getSnapshot().model;
  const key = model.kind === 'class' ? routeKeys(model.relations)[0] : sequenceRouteKeys(model.steps)[0];
  const points = [{ x: 260, y: 310 }];
  const listener = vi.fn(); store.subscribe(listener);
  store.updateSource(writeRoute(source, key, points));
  expect(listener).toHaveBeenCalledTimes(1);
  store.undo(); expect(readRoutes(store.getSnapshot().source).has(key)).toBe(false);
  store.redo(); expect(readRoutes(store.getSnapshot().source).get(key)).toEqual(points);
  store.updateSource(source + '\n%% extra comment');
  expect(readRoutes(store.getSnapshot().source).get(key)).toEqual(points);
  store.openSource(store.getPersistedSource());
  expect(canvasEdges(store.getSnapshot())[0].points).toContainEqual(points[0]);
});
it.each(['size', 'color'])('preserves %s before any node move when stale metadata is pasted [SPEC-3.1][SPEC-3.2]', change => {
  const store = new DiagramStore(parser, new GridLayout(), 'classDiagram\nclass A');
  const stale = store.getPersistedSource();
  if (change === 'size') store.resizeNode('class:A', 310, 140);
  else store.setNodeColor('class:A', '#ffeeaa');
  const edited = store.getSnapshot().layout['class:A'];
  store.updateSource(stale + '\nclass B');
  expect(store.getSnapshot().layout['class:A']).toEqual(edited);
});
it('rejects corrupt sequence route files before publishing a new document [SPEC-2.3][SPEC-5.2][SPEC-1.2]', () => {
  const store = new DiagramStore(parser, new GridLayout(), 'sequenceDiagram\nA->>B: request');
  const before = store.getSnapshot();
  expect(() => store.openSource('sequenceDiagram\nA->>B: request\n%% @se-uml-route nope')).toThrow();
  expect(store.getSnapshot()).toBe(before);
  store.updateSource('sequenceDiagram\nA->>B: request\n%% @se-uml-route nope');
  expect(store.getSnapshot().error).not.toBeNull();
  expect(store.getSnapshot().model).toBe(before.model);
});
