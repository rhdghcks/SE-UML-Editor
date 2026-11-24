import { expect, it } from 'vitest';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import { DiagramStore } from '../../../src/core/diagram-store';
import { readLayoutMetadata } from '../../../src/core/layout-metadata';

it.each([
  ['classDiagram', 'class', 'class:A'],
  ['sequenceDiagram', 'participant', 'participant:A'],
])('merges positions and restores edit boundaries for %s [SPEC-3.1][SPEC-3.2][SPEC-5.3]', (header, keyword, id) => {
  const source = header + '\n' + keyword + ' A';
  const store = new DiagramStore(new BasicMermaidParser(), new GridLayout(), source);
  const stale = store.getPersistedSource();
  store.moveNode(id, 385, 124);
  const moved = store.getSnapshot();
  const typing = Symbol();
  store.updateSource(stale + '\n' + keyword + ' B', typing);
  store.updateSource(stale + '\n' + keyword + ' BC', typing);
  const edited = store.getSnapshot();
  expect(edited.error).toBeNull();
  expect(readLayoutMetadata(edited.source).layout?.[id]).toEqual(moved.layout[id]);
  expect(Object.keys(edited.layout)).toHaveLength(2);
  store.undo();
  expect(store.getSnapshot().source).toBe(moved.source);
  store.undo();
  expect(store.getSnapshot().source).toBe(source);
  store.redo();
  store.redo();
  expect(store.getSnapshot().source).toBe(edited.source);
});

it('keeps manual size and color when stale metadata returns and drops removed nodes [SPEC-3.1][SPEC-3.2]', () => {
  const store = new DiagramStore(new BasicMermaidParser(), new GridLayout(), 'classDiagram\nclass A\nclass B');
  store.moveNode('class:A', 301, 95);
  const stale = store.getPersistedSource();
  store.resizeNode('class:A', 310, 140);
  store.setNodeColor('class:A', '#ffeeaa');
  const box = store.getSnapshot().layout['class:A'];
  store.updateSource(stale.replace('class B', 'class C'));
  const edited = store.getSnapshot();
  expect(edited.error).toBeNull();
  expect(edited.layout['class:A']).toEqual(box);
  expect(readLayoutMetadata(edited.source).layout).toEqual(edited.layout);
  expect(edited.layout).not.toHaveProperty('class:B');
});
