import { expect, it } from 'vitest';
import { BasicMermaidParser } from '../adapters/basic-mermaid-parser';
import { GridLayout } from '../adapters/grid-layout';
import { DiagramStore } from './diagram-store';
import { readLayoutMetadata } from './layout-metadata';

it.each([
  ['classDiagram', 'class', 'class:A'],
  ['sequenceDiagram', 'participant', 'participant:A'],
])('merges positions and restores edit boundaries for %s', (header, keyword, id) => {
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
