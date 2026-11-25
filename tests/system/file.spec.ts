import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  // OS 저장 창은 자동화할 수 없다. 저장 창이 없는 브라우저처럼 만들어 다운로드 경로로 파일을 받는다.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  await page.getByRole('button', { name: '클래스 예제' }).click();
});

test('[ST-12] 코드 영역에서 Ctrl+S로 작업 파일을 저장한다', {
  tag: ['@SPEC-5.1'],
}, async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await source.fill('classDiagram\n  class Invoice');
  await expect(page.getByText(/저장 안 됨/)).toBeVisible();

  const downloading = page.waitForEvent('download');
  await source.press('ControlOrMeta+s');
  const download = await downloading;

  expect(download.suggestedFilename()).toBe('diagram.mmd');
  const path = await download.path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  expect(await readFile(path, 'utf8')).toMatch(/^classDiagram\n {2}class Invoice\n%% @se-uml-layout /);
  await expect(page.getByText(/저장 안 됨/)).toBeHidden();
});

test('[ST-14] 코드 영역의 Ctrl+Z와 Ctrl+Shift+Z는 코드 편집과 GUI 편집을 한 이력으로 되돌린다', {
  tag: ['@SPEC-5.3', '@SPEC-3.2'],
}, async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await source.fill('classDiagram\n  class Invoice');
  await page.locator('g.canvas-node').filter({ hasText: 'Invoice' }).click();
  await page.getByTitle('#e8eefb').click();
  const colored = await source.inputValue();
  expect(colored).toMatch(/#e8eefb/);

  await source.press('ControlOrMeta+z');
  await expect(source).toHaveValue('classDiagram\n  class Invoice');
  await source.press('ControlOrMeta+z');
  await expect(source).not.toHaveValue(/Invoice/);
  await source.press('ControlOrMeta+Shift+z');
  await source.press('ControlOrMeta+Shift+z');
  await expect(source).toHaveValue(colored);
});

test('[ST-13] 저장하지 않은 변경이 있으면 예제를 열기 전에 확인하고, 취소하면 작업을 유지한다', {
  tag: ['@SPEC-5.2'],
}, async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await source.fill('classDiagram\n  class Invoice');
  const asked = page.waitForEvent('dialog');
  page.once('dialog', dialog => void dialog.dismiss());

  await page.getByRole('button', { name: '시퀀스 예제' }).click();

  expect((await asked).message()).toContain('저장하지 않은 변경');
  await expect(source).toHaveValue('classDiagram\n  class Invoice');
});

// SVG 좌표를 화면 좌표로 바꿔 드래그한다.
async function toScreen(page: Page, x: number, y: number) {
  return page.locator('svg.diagram-svg').evaluate((svg: SVGSVGElement, point) => {
    const matrix = svg.getScreenCTM();
    if (!matrix) throw new Error('SVG 좌표 변환을 찾을 수 없습니다.');
    const result = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: result.x, y: result.y };
  }, { x, y });
}
async function dragSvg(page: Page, from: [number, number], to: [number, number]) {
  const a = await toScreen(page, ...from), b = await toScreen(page, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
}
// 다시 열었을 때 같아야 하는 화면 상태: 노드의 좌표·크기·색상과 간선 경로
async function picture(page: Page) {
  const nodes = await page.locator('g.canvas-node .node-box').evaluateAll(rects => rects.map(rect =>
    ['x', 'y', 'width', 'height', 'fill'].map(name => rect.getAttribute(name)).join(' ')));
  const edges = await page.locator('.edge-line').evaluateAll(lines => lines.map(line => line.getAttribute('points')));
  return { nodes, edges };
}

test('[ST-20] 좌표·크기·색상·꺾임을 편집해 저장한 파일을 다른 문서를 연 뒤 다시 열면 그대로 복원된다', {
  tag: ['@SPEC-5.1', '@SPEC-5.2', '@SPEC-3.2'],
}, async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const boxes = {
    'class:A': { x: 60, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
    'class:B': { x: 350, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' },
  };
  await source.fill('classDiagram\nA --> B\n%% @se-uml-layout ' + JSON.stringify({ version: 1, nodes: boxes }));
  await page.getByRole('checkbox', { name: '노드·간선 스냅' }).uncheck();

  await dragSvg(page, [300, 126], [300, 206]);                       // 간선 꺾기
  await expect(page.locator('.bend-handle')).toHaveCount(2);
  await page.locator('[data-node-id="class:A"] .node-box').click();
  await page.getByTitle('#dff2e5').click();                          // 색상
  await dragSvg(page, [245, 177], [285, 207]);                       // 크기 조절 핸들
  await dragSvg(page, [400, 100], [430, 300]);                       // B 이동
  const edited = await picture(page);
  expect(edited.nodes).toEqual(['60 70 230 142 #dff2e5', '380 270 190 112 #ffffff']);

  const downloading = page.waitForEvent('download');
  await source.press('ControlOrMeta+s');
  const path = await (await downloading).path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  await expect(page.getByText(/저장 안 됨/)).toBeHidden();

  await page.getByRole('button', { name: '시퀀스 예제' }).click();
  await expect(source).toHaveValue(/^sequenceDiagram/);
  await page.locator('input[type=file]').setInputFiles(path);

  await expect(source).toHaveValue(/^classDiagram\nA --> B/);
  expect(await picture(page)).toEqual(edited);
  await expect(page.getByText(/저장 안 됨/)).toBeHidden();
});

test('[ST-21] 저장할 때마다 덮어쓰지 않고 diagram.mmd, diagram(1).mmd 순서로 새 파일을 만든다', {
  tag: ['@SPEC-5.1'],
}, async ({ page }) => {
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const save = async () => {
    const downloading = page.waitForEvent('download');
    await source.press('ControlOrMeta+s');
    const download = await downloading;
    const path = await download.path();
    if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
    return { name: download.suggestedFilename(), text: await readFile(path, 'utf8') };
  };

  await source.fill('classDiagram\n  class Invoice');
  const first = await save();
  await source.fill('classDiagram\n  class Invoice\n  class Order');
  const second = await save();

  expect([first.name, second.name]).toEqual(['diagram.mmd', 'diagram(1).mmd']);
  expect(first.text).toMatch(/^classDiagram\n {2}class Invoice\n%% @se-uml-layout /);
  expect(second.text).toMatch(/^classDiagram\n {2}class Invoice\n {2}class Order\n%% @se-uml-layout /);
});
