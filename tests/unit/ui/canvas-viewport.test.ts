import { expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, fitViewport, panViewport, zoomViewport } from '../../../src/ui/canvas-viewport';

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

it('전체 보기는 다이어그램을 여백 안에 맞추고 가운데 배치한다 [SPEC-2.5]', () => {
  expect(fitViewport({ x: 100, y: 50, width: 400, height: 200 }, { width: 900, height: 480 }, 40))
    .toEqual({ x: -150, y: -60, scale: 2 });
});
it('음수 좌표·세로형·매우 큰 다이어그램도 잘리지 않게 맞춘다 [SPEC-2.5]', () => {
  expect(fitViewport({ x: -100, y: -50, width: 200, height: 400 }, { width: 480, height: 900 }, 40))
    .toEqual({ x: 240, y: 150, scale: 2 });
  expect(fitViewport({ x: 0, y: 0, width: 1000, height: 1000 }, { width: 100, height: 100 }, 10))
    .toEqual({ x: 10, y: 10, scale: 0.08 });
});
it('빈 그림은 기본 보기로 돌아가고 작은 그림의 확대는 상한을 지킨다 [SPEC-2.5]', () => {
  expect(fitViewport({ x: 0, y: 0, width: 0, height: 0 }, { width: 900, height: 480 }))
    .toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitViewport({ x: 10, y: 10, width: 1, height: 1 }, { width: 900, height: 480 }).scale).toBe(MAX_ZOOM);
});
it('전체 보기의 유효하지 않은 영역이나 여백을 거부한다 [SPEC-2.5]', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  for (const frame of [{ width: 0, height: 480 }, { width: 900, height: NaN }, { width: 48, height: 48 }]) {
    expect(() => fitViewport(bounds, frame)).toThrow(RangeError);
  }
  expect(() => fitViewport({ ...bounds, width: -1 }, { width: 900, height: 480 })).toThrow(RangeError);
  expect(() => fitViewport(bounds, { width: 900, height: 480 }, -1)).toThrow(RangeError);
});
