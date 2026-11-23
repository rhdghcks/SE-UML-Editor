import { describe, expect, it } from 'vitest';
import { BasicMermaidParser } from './basic-mermaid-parser';
import { GridLayout } from './grid-layout';
import { arrangeClasses } from './elk-layout';
import { DiagramStore } from '../core/diagram-store';
import { readRoutes, routeKeys } from '../core/manual-routes';

const parser = new BasicMermaidParser();
const grid = new GridLayout();
describe('M2 layout', () => {
  it('places related classes in layers while keeping existing boxes', async () => {
    const model = parser.parse('classDiagram\nA --> B');
    if (model.kind !== 'class') throw new Error();
    const boxes = grid.layout(model, {});
    const arranged = await arrangeClasses(model, boxes, Object.keys(boxes));
    expect(arranged['class:B'].x).toBeGreaterThan(arranged['class:A'].x);
    const pinned = { ...arranged['class:A'], x: 400, y: 200 };
    const next = await arrangeClasses(model, { ...arranged, 'class:A': pinned }, ['class:B']);
    expect(next['class:A']).toEqual(pinned);
  });

  it('places a new sequence lane after the existing participant', () => {
    const model = parser.parse('sequenceDiagram\nparticipant A\nparticipant B');
    const a = { x: 600, y: 200, width: 170, height: 70, color: '#ffffff' };
    const layout = grid.layout(model, { 'participant:A': a });
    expect(layout['participant:B'].x).toBeGreaterThan(770);
  });

  it('preserves manual bends across unrelated relation insertion and file round-trip', () => {
    const source = 'classDiagram\nA --> B';
    const model = parser.parse(source);
    if (model.kind !== 'class') throw new Error();
    const key = routeKeys(model.relations)[0];
    const points = [{ x: 123, y: 321 }];
    const store = new DiagramStore(parser, grid, source + '\n%% @se-uml-route ' + JSON.stringify({ key, points }));
    store.updateSource('classDiagram\nX --> Y\nA --> B');
    store.moveNode('class:A', 12, 14);
    store.openSource(store.getPersistedSource());
    expect(readRoutes(store.getSnapshot().source).get(key)).toEqual(points);
  });
});
