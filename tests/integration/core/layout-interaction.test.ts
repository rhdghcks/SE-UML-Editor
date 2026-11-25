import { expect, it } from 'vitest';
import { LayoutInteraction } from '../../../src/core/layout-interaction';
import { DiagramStore } from '../../../src/core/diagram-store';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';

function setup() {
  const interaction = new LayoutInteraction();
  let finishLayout!: () => void;
  const work = new Promise<void>(resolve => { finishLayout = resolve; });
  const store = new DiagramStore(new BasicMermaidParser(), new GridLayout(), 'classDiagram\nclass Invoice', undefined,
    (_model, boxes) => interaction.complete(work.then(() => ({
      ...boxes, 'class:Invoice': { ...boxes['class:Invoice'], x: 700, y: 300 },
    }))));
  return { interaction, store, finishLayout };
}

it('preserves the active drag document when layout completes, then commits one undo step [SPEC-2.1][SPEC-3.1][SPEC-5.3]', async () => {
  const { interaction, store, finishLayout } = setup();
  const before = store.getSnapshot();
  const end = interaction.begin();
  await Promise.resolve();
  finishLayout();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot()).toBe(before);
  store.moveNode('class:Invoice', 102, 94);
  end();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot().layout['class:Invoice']).toMatchObject({ x: 102, y: 94, placement: 'manual' });
  store.undo();
  expect(store.getSnapshot().layout).toEqual(before.layout);
  expect(store.canUndo()).toBe(false);
});

it('allows completed layout after a cancelled gesture without creating undo history [SPEC-3.1][SPEC-5.3]', async () => {
  const { interaction, store, finishLayout } = setup();
  const end = interaction.begin();
  await Promise.resolve();
  finishLayout();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot().layout['class:Invoice'].x).toBe(60);
  end(); end();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot().layout['class:Invoice'].x).toBe(700);
  expect(store.canUndo()).toBe(false);
});

it('does not publish into a new document after the gesture is released [SPEC-3.1][SPEC-5.2]', async () => {
  const { interaction, store, finishLayout } = setup();
  const end = interaction.begin();
  await Promise.resolve();
  finishLayout();
  store.openSource('sequenceDiagram\nparticipant User');
  end();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(store.getSnapshot().model.kind).toBe('sequence');
  expect(store.getSnapshot().layout).not.toHaveProperty('class:Invoice');
});
