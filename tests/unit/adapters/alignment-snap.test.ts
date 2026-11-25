import { expect, it } from 'vitest';
import { AlignmentSnap } from '../../../src/adapters/alignment-snap';
import type { DiagramDocument, LayoutMap } from '../../../src/core/types';

const layout: LayoutMap = {
  a: { x: 0, y: 0, width: 100, height: 80, color: '#ffffff' },
  b: { x: 200, y: 100, width: 100, height: 80, color: '#ffffff' },
};
const document: DiagramDocument = { source: '', model: { kind: 'class', nodes: [], relations: [] }, layout };
it('aligns a nearby node edge and center without changing the input [SPEC-2.1]', () => {
  const snap = new AlignmentSnap(() => document);
  const point = Object.freeze({ x: 103, y: 105 });
  expect(snap.snap(point, 'a', layout)).toEqual({ x: 100, y: 100 });
  expect(point).toEqual({ x: 103, y: 105 });
  expect(layout.a.x).toBe(0);
});
it('does not attract distant nodes and supports disabling snapping [SPEC-2.1]', () => {
  const snap = new AlignmentSnap(() => document);
  expect(snap.snap({ x: 700, y: 105 }, 'a', layout)).toEqual({ x: 700, y: 105 });
  snap.enabled = false;
  expect(snap.snap({ x: 103, y: 105 }, 'a', layout)).toEqual({ x: 103, y: 105 });
  expect(() => snap.snap({ x: Infinity, y: 0 }, 'a', layout)).toThrow();
});
it('snaps to an unrelated edge but never to an edge incident on the moving node [SPEC-2.1]', () => {
  const boxes = { ...layout,
    c: { ...layout.a, x: 0, y: 300 }, d: { ...layout.a, x: 400, y: 300 },
    moving: { ...layout.a, x: 100, y: 0 },
  };
  const doc: DiagramDocument = { source: '', layout: boxes,
    model: { kind: 'class', nodes: [], relations: [{ id: 'edge', from: 'c', to: 'd', connector: '-->', label: '' }] } };
  const snap = new AlignmentSnap(() => doc);
  const snapped = snap.snap({ x: 150, y: 295 }, 'moving', boxes);
  expect(snapped).toEqual({ x: 150, y: 300 });
  expect(snap.snap(snapped, 'moving', boxes)).toEqual(snapped);
  doc.model = { kind: 'class', nodes: [], relations: [{ id: 'edge', from: 'moving', to: 'd', connector: '-->', label: '' }] };
  expect(snap.snap({ x: 150, y: 295 }, 'moving', boxes)).toEqual({ x: 150, y: 295 });
});
