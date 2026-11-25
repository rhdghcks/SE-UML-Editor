import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const source = 'classDiagram\nA --> B : relation\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes: {
  'class:A': { x: 60, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
  'class:B': { x: 350, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
} });

async function open(page: Page) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Mermaid 코드' }).fill(source);
  await expect(page.locator('.feedback.error')).toHaveCount(0);
}
async function screen(page: Page, x: number, y: number) {
  return page.locator('.canvas-world').evaluate((world: SVGGElement, point) => {
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('Missing world transform');
    const p = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: p.x, y: p.y };
  }, { x, y });
}
async function pan(page: Page) {
  const start = await screen(page, 650, 250);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 30); await page.mouse.up();
}

test('[TC-CANVAS-2.5-01] 휠 확대는 커서를 기준으로 하며 화면 이동은 문서와 페이지 스크롤을 바꾸지 않는다', { tag: ['@SPEC-2.5'] }, async ({ page }) => {
  await open(page);
  const point = await screen(page, 300, 200);
  const cursor = { x: Math.round(point.x), y: Math.round(point.y) };
  const worldPoint = await page.locator('.canvas-world').evaluate((world: SVGGElement, client) => {
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('Missing world transform');
    const p = new DOMPoint(client.x, client.y).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }, cursor);
  const scroll = await page.evaluate(() => window.scrollY);
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.wheel(0, -200);
  await expect(page.getByLabel('캔버스 배율')).not.toHaveText('100%');
  const anchored = await screen(page, worldPoint.x, worldPoint.y);
  expect(anchored.x).toBeCloseTo(cursor.x, 2);
  expect(anchored.y).toBeCloseTo(cursor.y, 2);
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll);
  const before = await screen(page, 100, 100);
  await pan(page);
  const after = await screen(page, 100, 100);
  expect(after.x - before.x).toBeCloseTo(45, 2);
  expect(after.y - before.y).toBeCloseTo(30, 2);
  await expect(page.getByRole('textbox', { name: 'Mermaid 코드' })).toHaveValue(source);
  await expect(page.locator('[data-node-id="class:A"] .node-box')).toHaveAttribute('x', '60');
});

test('[TC-CANVAS-2.5-02] 확대·이동 후에도 노드 이동과 선 더블클릭 좌표가 맞는다', { tag: ['@SPEC-2.5', '@SPEC-2.1', '@SPEC-2.3', '@SPEC-5.3'] }, async ({ page }) => {
  await open(page);
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();
  await page.getByRole('button', { name: '캔버스 확대', exact: true }).click();
  await pan(page);
  const transform = await page.locator('.canvas-world').getAttribute('transform');
  const from = await screen(page, 100, 100), to = await screen(page, 142, 124);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
  await expect(page.locator('[data-node-id="class:A"] .node-box')).toHaveAttribute('x', '102');
  await expect(page.locator('[data-node-id="class:A"] .node-box')).toHaveAttribute('y', '94');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('[data-node-id="class:A"] .node-box')).toHaveAttribute('x', '60');
  await expect(page.locator('.canvas-world')).toHaveAttribute('transform', transform!);
  const bend = await screen(page, 280, 126);
  await page.mouse.dblclick(bend.x, bend.y);
  await expect(page.locator('.bend-handle')).toHaveCount(1);
  // Mouse double-click coordinates are quantized to CSS pixels by Chromium.
  await expect.poll(async () => Math.abs(Number(await page.locator('.bend-handle').getAttribute('cx')) - 280)).toBeLessThan(1);
  await expect.poll(async () => Number(await page.locator('.bend-handle').getAttribute('cy'))).toBeCloseTo(126, 2);
});

test('[TC-CANVAS-2.5-03] 보기 초기화는 배율·위치를 복구하고 Escape는 화면 이동을 취소한다', { tag: ['@SPEC-2.5'] }, async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '캔버스 확대', exact: true }).click();
  await expect(page.getByLabel('캔버스 배율')).toHaveText('120%');
  const before = await page.locator('.canvas-world').getAttribute('transform');
  const start = await screen(page, 650, 250);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('.canvas-world')).toHaveAttribute('transform', before!);
  await pan(page);
  await page.getByRole('button', { name: '보기 초기화', exact: true }).click();
  await expect(page.getByLabel('캔버스 배율')).toHaveText('100%');
  await expect(page.locator('.canvas-world')).toHaveAttribute('transform', 'translate(0 0) scale(1)');
  await expect(page.getByRole('textbox', { name: 'Mermaid 코드' })).toHaveValue(source);
});
