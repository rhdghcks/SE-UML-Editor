import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 1000 } });
const code = `sequenceDiagram
participant User
participant Server
User->>Server: login()
activate Server
Server-->>User: token
deactivate Server
alt valid
User->>Server: next
else expired
Server-->>User: no
end`;
const source = code + '\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes: {
  'participant:User': { x: 60, y: 70, width: 190, height: 70, color: '#ffffff', placement: 'manual' },
  'participant:Server': { x: 350, y: 70, width: 190, height: 70, color: '#ffffff', placement: 'manual' },
} });
async function open(page: Page) {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Mermaid 코드' }).fill(source);
  await expect(page.locator('.feedback.error')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();
}
async function screen(page: Page, x: number, y: number) {
  return page.locator('.canvas-world').evaluate((world: SVGGElement, p) => {
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('Missing world transform');
    const point = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, { x, y });
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await screen(page, from.x, from.y), b = await screen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
}

test('[TC-CANVAS-2.2-01] 시퀀스 화살표는 생명선에 붙어 수직 이동하고 설명·Undo·코드 편집·저장 복원에 연동된다', {
  tag: ['@SPEC-2.2', '@SPEC-1.3', '@SPEC-5.3', '@SPEC-5.2', '@SPEC-3.1'],
}, async ({ page }) => {
  await open(page);
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const arrow = page.locator('.edge-line').first();
  await expect(arrow).toHaveAttribute('points', '155,200 445,200');
  await drag(page, { x: 300, y: 200 }, { x: 340, y: 300 });
  await expect(arrow).toHaveAttribute('points', '155,300 445,300');
  await expect(page.locator('.bend-handle')).toHaveCount(0);
  await expect(editor).toHaveValue(/"points":\[\],"offsetY":100/);
  await expect(page.locator('.canvas-edge text').first()).toHaveAttribute('y', '290');
  await expect(page.getByText('activate: Server', { exact: true })).toHaveAttribute('y', '324');
  await expect(page.locator('.edge-line').nth(1)).toHaveAttribute('points', '445,348 155,348');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(arrow).toHaveAttribute('points', '155,200 445,200');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(arrow).toHaveAttribute('points', '155,300 445,300');
  await editor.fill(code + '\n%% code edit');
  await expect(arrow).toHaveAttribute('points', '155,300 445,300');
  await drag(page, { x: 100, y: 100 }, { x: 650, y: 100 });
  await expect(arrow).toHaveAttribute('points', '705,300 445,300');
  await expect(page.getByText('activate: Server', { exact: true })).toHaveAttribute('x', '429');
  await expect(page.getByText('alt: valid', { exact: true })).toHaveAttribute('x', '429');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장', exact: true }).click();
  const file = await (await downloading).path();
  if (!file) throw new Error('Missing saved file');
  await page.getByRole('button', { name: '클래스 예제', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(arrow).toHaveAttribute('points', '705,300 445,300');
  await expect(page.getByText('activate: Server', { exact: true })).toHaveAttribute('y', '324');
});

test('[TC-CANVAS-2.2-02] 확대·화면 이동 후 수직 드래그와 꺾임점 편집·초기화·취소를 구분한다', {
  tag: ['@SPEC-2.2', '@SPEC-2.3', '@SPEC-2.5', '@SPEC-5.3'],
}, async ({ page }) => {
  await open(page);
  const arrow = page.locator('.edge-line').first();
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await page.getByRole('button', { name: '캔버스 확대', exact: true }).click();
  const pan = await screen(page, 700, 400);
  await page.mouse.move(pan.x, pan.y); await page.mouse.down();
  await page.mouse.move(pan.x - 20, pan.y - 20); await page.mouse.up();
  await drag(page, { x: 300, y: 200 }, { x: 350, y: 260 });
  await expect(arrow).toHaveAttribute('points', '155,260 445,260');
  await expect(page.locator('.bend-handle')).toHaveCount(0);
  const add = await screen(page, 300, 260);
  await page.mouse.dblclick(add.x, add.y);
  await expect(page.locator('.bend-handle')).toHaveCount(1);
  const handle = page.locator('.bend-handle');
  const x = Number(await handle.getAttribute('cx'));
  await drag(page, { x, y: 260 }, { x, y: 285 });
  await drag(page, { x: (155 + x) / 2, y: 272.5 }, { x: (155 + x) / 2 + 80, y: 312.5 });
  await expect.poll(async () => (await arrow.getAttribute('points'))?.split(' ')[0]).toBe('155,300');
  await expect.poll(async () => Number(await handle.getAttribute('cy'))).toBeCloseTo(325, 1);
  await expect(page.locator('.bend-handle')).toHaveCount(1);
  await page.getByRole('button', { name: '경로 초기화', exact: true }).click();
  await expect(arrow).toHaveAttribute('points', '155,200 445,200');
  await expect(page.locator('.bend-handle')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const original = await editor.inputValue();
  const from = await screen(page, (155 + x) / 2, 312.5), to = await screen(page, (155 + x) / 2, 362.5);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(editor).toHaveValue(original);
});
