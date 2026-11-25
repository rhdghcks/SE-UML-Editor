import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const source = `sequenceDiagram
participant User
participant Server
User->>Server: login()
activate Server
Server-->>User: token
deactivate Server
alt valid token
User->>Server: getProfile()
else expired
Server-->>User: unauthorized
end
%% @se-uml-layout ${JSON.stringify({ version: 1, nodes: {
  'participant:User': { x: 60, y: 70, width: 190, height: 70, color: '#ffffff', placement: 'manual' },
  'participant:Server': { x: 350, y: 70, width: 190, height: 70, color: '#ffffff', placement: 'manual' },
} })}`;

async function screen(page: Page, x: number, y: number) {
  return page.locator('.canvas-world').evaluate((world: SVGGElement, p) => {
    const matrix = world.getScreenCTM();
    if (!matrix) throw new Error('Missing SVG transform');
    const point = new DOMPoint(p.x, p.y).matrixTransform(matrix);
    return { x: point.x, y: point.y };
  }, { x, y });
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const a = await screen(page, from.x, from.y), b = await screen(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
}

test('[TC-CANVAS-2.1-04] 참여자 순서를 바꿔도 모든 설명이 같은 왼쪽 열에 정렬되고 저장·복원된다', {
  tag: ['@SPEC-2.1', '@SPEC-1.3', '@SPEC-5.3', '@SPEC-5.2'],
}, async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await editor.fill(source);
  await expect(page.locator('.feedback.error')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();
  const activate = page.getByText('activate: Server', { exact: true });
  const deactivate = page.getByText('deactivate: Server', { exact: true });
  const labels = ['activate: Server', 'deactivate: Server', 'alt: valid token', 'else: expired']
    .map(text => page.getByText(text, { exact: true }));
  async function expectOutsideLifelines() {
    const lineX = await page.locator('.canvas-world line[stroke-dasharray="6 5"]').evaluateAll(lines =>
      Math.min(...lines.map(line => line.getBoundingClientRect().left)));
    const frame = await page.locator('svg.diagram-svg').boundingBox();
    if (!frame) throw new Error('Canvas not visible');
    for (const label of labels) {
      const bounds = await label.boundingBox();
      if (!bounds) throw new Error('Annotation not visible');
      expect(bounds.x + bounds.width).toBeLessThan(lineX - 1);
      expect(bounds.x).toBeGreaterThan(frame.x);
    }
  }
  for (const label of labels) {
    await expect(label).toHaveAttribute('x', '139');
    await expect(label).toHaveAttribute('text-anchor', 'end');
  }
  await expect(activate).toHaveAttribute('x', '139');
  await expect(activate).toHaveAttribute('text-anchor', 'end');
  await expectOutsideLifelines();
  await drag(page, { x: 100, y: 100 }, { x: 650, y: 100 });
  for (const label of [activate, deactivate]) {
    await expect(label).toHaveAttribute('x', '429');
    await expect(label).toHaveAttribute('text-anchor', 'end');
  }
  for (const text of ['alt: valid token', 'else: expired']) {
    await expect(page.getByText(text, { exact: true })).toHaveAttribute('x', '429');
  }
  await page.getByRole('button', { name: '캔버스 확대', exact: true }).click();
  await drag(page, { x: 400, y: 100 }, { x: 500, y: 120 });
  await expect(activate).toHaveAttribute('x', '529');
  await expect(activate).toHaveAttribute('y', '285');
  for (const label of labels) {
    await expect(label).toHaveAttribute('x', '529');
    await expect(label).toHaveAttribute('text-anchor', 'end');
  }
  await expect(deactivate).toHaveAttribute('x', '529');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(activate).toHaveAttribute('x', '429');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(activate).toHaveAttribute('x', '529');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장', exact: true }).click();
  const file = await (await download).path();
  if (!file) throw new Error('Missing saved diagram');
  await page.getByRole('button', { name: '클래스 예제', exact: true }).click();
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(activate).toHaveAttribute('x', '529');
  await expect(deactivate).toHaveAttribute('x', '529');
  await expect(page.getByText('alt: valid token', { exact: true })).toHaveAttribute('x', '529');
  await page.getByRole('button', { name: '보기 초기화', exact: true }).click();
  await expectOutsideLifelines();
});
