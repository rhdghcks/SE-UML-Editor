import { expect, it, vi } from 'vitest';
import { writeRoute } from '../../../src/core/route-editing';
import { readRoutes, routeKeys } from '../../../src/core/manual-routes';
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
