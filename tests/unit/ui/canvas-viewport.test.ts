import { expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, panViewport, zoomViewport } from '../../../src/ui/canvas-viewport';

it('이동한 화면을 확대해도 커서 아래 문서 좌표를 유지한다 [SPEC-2.5]', () => {
  const view = Object.freeze({ x: 40, y: -20, scale: 1.5 });
  const anchor = { x: 300, y: 200 };
  const next = zoomViewport(view, anchor, 1.25);
  expect((anchor.x - next.x) / next.scale).toBeCloseTo((anchor.x - view.x) / view.scale);
  expect((anchor.y - next.y) / next.scale).toBeCloseTo((anchor.y - view.y) / view.scale);
  expect(view).toEqual({ x: 40, y: -20, scale: 1.5 });
});
it('배율을 25~400%로 제한하고 한계에서 반복 확대해도 보기가 변하지 않는다 [SPEC-2.5]', () => {
  const initial = { x: 0, y: 0, scale: 1 };
  const anchor = { x: 100, y: 80 };
  const maximum = zoomViewport(initial, anchor, 100);
  expect(maximum.scale).toBe(MAX_ZOOM);
  expect(zoomViewport(maximum, anchor, 2)).toEqual(maximum);
  expect(zoomViewport(initial, anchor, 0.001).scale).toBe(MIN_ZOOM);
});
it('화면 이동은 배율을 유지하고 반대 이동으로 원래 위치에 돌아온다 [SPEC-2.5]', () => {
  const view = { x: 30, y: 40, scale: 2 };
  const moved = panViewport(view, { x: -70, y: 100 });
  expect(moved).toEqual({ x: -40, y: 140, scale: 2 });
  expect(panViewport(moved, { x: 70, y: -100 })).toEqual(view);
});
it('0·음수·유한하지 않은 배율을 거부한다 [SPEC-2.5]', () => {
  for (const factor of [0, -1, NaN, Infinity]) {
    expect(() => zoomViewport({ x: 0, y: 0, scale: 1 }, { x: 0, y: 0 }, factor)).toThrow(RangeError);
  }
});
