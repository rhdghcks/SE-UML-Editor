import { describe, expect, it, vi } from 'vitest';
import { GridLayout } from '../adapters/grid-layout';
import { BasicMermaidParser } from '../adapters/basic-mermaid-parser';
import { DiagramStore } from './diagram-store';
import { readLayoutMetadata } from './layout-metadata';

const SAMPLE = `classDiagram
  class User
  class Account
  User --> Account : uses`;
const createStore = (source = SAMPLE) =>
  new DiagramStore(new BasicMermaidParser(), new GridLayout(), source);

describe('DiagramStore', () => {
  it('preserves moved coordinates in Mermaid comments and after reload', () => {
    const store = createStore();
    store.moveNode('class:User', 321, 158);
    const saved = store.getSnapshot().source;
    expect(saved).toContain('%% @se-uml-layout ');
    expect(readLayoutMetadata(saved).layout?.['class:User'].x).toBe(321);
    expect(createStore(saved).getSnapshot().layout['class:User'].y).toBe(158);
  });

  it('keeps adjusted positions when new code introduces a node', () => {
    const store = createStore();
    store.moveNode('class:User', 407, 245);
    store.updateSource(`classDiagram\n  class User\n  class Account\n  class Invoice`);
    expect(store.getSnapshot().layout['class:User'].x).toBe(407);
    expect(store.getSnapshot().layout['class:Invoice']).toBeDefined();
    expect(Object.keys(store.getSnapshot().layout)).toHaveLength(3);
    expect(createStore(store.getPersistedSource()).getSnapshot().layout['class:User'].x).toBe(407);
  });

  it('keeps the last valid model when editing invalid code', () => {
    const store = createStore();
    store.updateSource('classDiagram\n  invalid syntax');
    expect(store.getSnapshot().error).toContain('2행');
    expect(store.getSnapshot().model.kind).toBe('class');
    expect(store.getSnapshot().source).toContain('invalid syntax');
    expect(() => store.moveNode('class:User', 1, 1)).toThrow();
    store.undo();
    expect(store.getSnapshot().error).toBeNull();
    expect(store.getSnapshot().source).toBe(SAMPLE);
  });

  it('supports five undo levels and redo', () => {
    const store = createStore();
    for (let index = 1; index <= 7; index++) store.moveNode('class:User', index * 10, 70);
    for (let index = 0; index < 5; index++) store.undo();
    expect(store.getSnapshot().layout['class:User'].x).toBe(20);
    expect(store.canUndo()).toBe(false);
    store.redo();
    expect(store.getSnapshot().layout['class:User'].x).toBe(30);
  });

  it('notifies listeners and resets redo after a new change', () => {
    const store = createStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.moveNode('class:User', 200, 200);
    store.undo();
    expect(store.canRedo()).toBe(true);
    store.setNodeColor('class:User', '#e8eefb');
    expect(store.canRedo()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    store.moveNode('class:User', 210, 210);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('rejects more than 30 canvas nodes', () => {
    const store = createStore();
    const source = 'classDiagram\n' + Array.from({ length: 31 }, (_, index) =>
      `class Node${index}`).join('\n');
    store.updateSource(source);
    expect(store.getSnapshot().error).toContain('최대 30개');
    expect(store.getSnapshot().model.kind).toBe('class');
  });
});
