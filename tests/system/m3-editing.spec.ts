import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const boxes = {
  'class:A': { x: 60, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
  'class:B': { x: 350, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
};
async function open(page: Page, code = 'classDiagram\nA --> B', nodes = boxes) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Mermaid 코드' }).fill(
    code + '\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes }));
  await expect(page.locator('.feedback.error')).toHaveCount(0);
}
async function screen(page: Page, x: number, y: number) {
  return page.locator('.canvas-world').evaluate((world: SVGGElement, point) => {
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('SVG transform is missing');
    const result = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: result.x, y: result.y };
  }, { x, y });
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await screen(page, from.x, from.y), b = await screen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
}
const node = (page: Page, id: string) => page.locator(`[data-node-id="${id}"] .node-box`);

test('[TC-CANVAS-2.1-01] snaps nodes and unrelated edges, with a switch to disable snapping', {
  tag: ['@SPEC-2.1'],
}, async ({ page }) => {
  await open(page);
  await drag(page, { x: 400, y: 100 }, { x: 305, y: 105 });
  await expect(node(page, 'class:B')).toHaveAttribute('x', '250');
  await expect(node(page, 'class:B')).toHaveAttribute('y', '70');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();
  await drag(page, { x: 400, y: 100 }, { x: 305, y: 105 });
  await expect(node(page, 'class:B')).toHaveAttribute('x', '255');
  await expect(node(page, 'class:B')).toHaveAttribute('y', '75');

  const edgeBoxes = { ...boxes, 'class:B': { ...boxes['class:B'], x: 500 },
    'class:C': { ...boxes['class:A'], x: 300, y: 300 } };
  await open(page, 'classDiagram\nA --> B\nclass C', edgeBoxes);
  await drag(page, { x: 350, y: 330 }, { x: 350, y: 105 });
  await expect(node(page, 'class:C')).toHaveAttribute('y', '70');
});

test('[TC-CANVAS-2.4-01] resize, fit all text, undo and file reload preserve node adjustments', {
  tag: ['@SPEC-2.4', '@SPEC-5.3', '@SPEC-5.2'],
}, async ({ page }) => {
  // OS 저장 창은 자동화할 수 없다. 저장 창이 없는 브라우저처럼 만들어 다운로드 경로로 파일을 받는다.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await open(page, 'classDiagram\nclass A {\n+first: string\n+second: string\n+third: string\n+fourthLongAttributeName: string\n+save()\n}\nclass B');
  await node(page, 'class:A').click();
  await expect(page.locator('[data-node-id="class:A"] text[data-content]')).toHaveCount(6);
  await drag(page, { x: 245, y: 177 }, { x: 310, y: 240 });
  await expect(node(page, 'class:A')).toHaveAttribute('width', '255');
  await expect(node(page, 'class:A')).toHaveAttribute('height', '175');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(node(page, 'class:A')).toHaveAttribute('width', '190');
  await page.getByRole('button', { name: '텍스트에 맞추기' }).click();
  await expect(node(page, 'class:A')).toHaveAttribute('height', '150');
  const width = await node(page, 'class:A').getAttribute('width');
  expect(Number(width)).toBeGreaterThan(190);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장', exact: true }).click();
  const file = await (await downloading).path();
  if (!file) throw new Error('Missing downloaded file');
  await page.getByRole('button', { name: '시퀀스 예제', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(node(page, 'class:A')).toHaveAttribute('width', width!);
  await expect(node(page, 'class:A')).toHaveAttribute('height', '150');
});

test('[TC-CANVAS-2.3-01] edge dragging, bend editing, reset and undo work without moving endpoints', {
  tag: ['@SPEC-2.3', '@SPEC-2.2', '@SPEC-5.3'],
}, async ({ page }) => {
  await open(page, 'classDiagram\nA --> B : relation');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const original = await editor.inputValue();
  await expect(page.getByRole('button', { name: '꺾임점 추가', exact: true })).toHaveCount(0);
  await page.locator('.canvas-edge text').dblclick();
  await drag(page, { x: 300, y: 126 }, { x: 300, y: 206 });
  await expect(editor).toHaveValue(original);
  await expect(page.locator('.bend-handle')).toHaveCount(0);
  for (const x of [280, 320]) {
    const point = await screen(page, x, 126);
    await page.mouse.dblclick(point.x, point.y);
  }
  await expect(page.locator('.bend-handle')).toHaveCount(2);
  await drag(page, { x: 300, y: 126 }, { x: 300, y: 206 });
  await expect(editor).toHaveValue(/@se-uml-route/);
  await expect(page.locator('.bend-handle')).toHaveCount(2);
  await expect(node(page, 'class:A')).toHaveAttribute('x', '60');
  const handle = page.locator('.bend-handle').first();
  const x = Number(await handle.getAttribute('cx')), y = Number(await handle.getAttribute('cy'));
  await drag(page, { x, y }, { x: x + 20, y: y + 25 });
  await expect.poll(async () => Number(await handle.getAttribute('cy'))).toBeCloseTo(y + 25, 2);
  await page.getByRole('button', { name: '꺾임점 삭제' }).click();
  await expect(page.locator('.bend-handle')).toHaveCount(1);
  const add = await screen(page, 287, 190);
  await page.mouse.dblclick(add.x, add.y);
  await expect(page.locator('.bend-handle')).toHaveCount(2);
  await page.getByRole('button', { name: '경로 초기화' }).click();
  await expect(page.locator('.bend-handle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.bend-handle')).toHaveCount(2);
});

test('[TC-CANVAS-2.1-02] Escape and pointer cancellation do not commit; pointerup uses its final coordinates', {
  tag: ['@SPEC-2.1', '@SPEC-5.3'],
}, async ({ page }) => {
  await open(page);
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const original = await editor.inputValue();
  const a = await screen(page, 100, 100), b = await screen(page, 170, 170);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(editor).toHaveValue(original);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.locator('svg.diagram-svg').dispatchEvent('pointerup', { pointerId: 1, clientX: b.x, clientY: b.y, button: 0 });
  await page.mouse.up();
  await expect(node(page, 'class:A')).toHaveAttribute('x', '130');
  await expect(node(page, 'class:A')).toHaveAttribute('y', '140');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).toHaveValue(original);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y);
  await page.locator('svg.diagram-svg').dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  await expect(editor).toHaveValue(original);
});

test('[TC-CANVAS-2.3-02] critical sequence messages retain edited bends after code changes', {
  tag: ['@SPEC-2.3', '@SPEC-3.1'],
}, async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await editor.fill('sequenceDiagram\ncritical main\nA->>B: request\noption retry\nB-->>A: wait\nend');
  const edge = page.locator('.edge-line').first();
  const points = (await edge.getAttribute('points'))!.split(' ').map(point => point.split(',').map(Number));
  const x = (points[0][0] + points[1][0]) / 2, y = points[0][1];
  const bend = await screen(page, x, y);
  await page.mouse.dblclick(bend.x, bend.y);
  await drag(page, { x: x - 20, y }, { x: x - 20, y: y + 20 });
  await expect(page.locator('.bend-handle')).toHaveCount(1);
  const route = await edge.getAttribute('points');
  await editor.fill((await editor.inputValue()).replace('critical main', 'critical edited'));
  await expect(edge).toHaveAttribute('points', route!);
  await expect(page.getByText('option: retry', { exact: true })).toBeVisible();
});
