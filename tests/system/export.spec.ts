import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const SCALE = 2;
const source = (page: Page) => page.getByRole('textbox', { name: 'Mermaid 코드' });
const invoiceRect = (page: Page) => page.locator('g.canvas-node').filter({ hasText: 'Invoice' }).locator('rect');

async function prepareInvoice(page: Page) {
  // OS 저장 창은 자동화할 수 없다. 저장 창이 없는 브라우저처럼 만들어 다운로드 경로로 파일을 받는다.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  await page.getByRole('button', { name: '클래스 예제' }).click();
  await source(page).fill('classDiagram\n  class Invoice');
  await invoiceRect(page).click();
  await page.getByTitle('#fff0ce').click();
  const box = (await invoiceRect(page).boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 90, { steps: 5 });
  await page.mouse.up();
  await expect(source(page)).toHaveValue(/"placement":"manual"/);
  const rect = invoiceRect(page);
  const [x, y] = await Promise.all([rect.getAttribute('x'), rect.getAttribute('y')]).then(v => v.map(Number));
  const [, , width, height] = (await page.locator('svg.diagram-svg').getAttribute('viewBox'))!.split(' ').map(Number);
  return { x, y, width, height };
}

async function exportAs(page: Page, label: 'PNG' | 'JPG', color: '컬러' | '흑백' = '컬러') {
  await page.getByRole('button', { name: '내보내기' }).click();
  await page.getByRole('radio', { name: label }).check();
  await page.getByRole('radio', { name: color }).check();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '이미지 저장' }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

// 브라우저에서 이미지를 디코딩해 크기와 지정 좌표의 RGB를 읽는다.
async function decode(page: Page, bytes: Buffer, mime: string, points: Array<[number, number]>) {
  return page.evaluate(async ({ base64, mime, points }) => {
    const image = new Image();
    image.src = `data:${mime};base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      pixels: points.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)]),
    };
  }, { base64: bytes.toString('base64'), mime, points });
}

test('[ST-02] 수동 배치·색상을 반영한 PNG 내보내기', {
  tag: ['@SPEC-6.1'],
}, async ({ page }) => {
  const canvas = await prepareInvoice(page);
  const before = await source(page).inputValue();

  const file = await exportAs(page, 'PNG');

  expect(file.name).toBe('diagram.png');
  expect([...file.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const inside: [number, number] = [(canvas.x + 10) * SCALE, (canvas.y + 10) * SCALE];
  const image = await decode(page, file.bytes, 'image/png', [inside]);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
  expect(image.pixels[0]).toEqual([0xff, 0xf0, 0xce]);
  await expect(source(page)).toHaveValue(before);
});

test('[ST-02] JPG 내보내기는 흰 배경의 JPEG 파일을 만든다', {
  tag: ['@SPEC-6.1'],
}, async ({ page }) => {
  const canvas = await prepareInvoice(page);

  const file = await exportAs(page, 'JPG');

  expect(file.name).toBe('diagram.jpg');
  expect([...file.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const image = await decode(page, file.bytes, 'image/jpeg', [[2, 2], [canvas.width * SCALE - 3, canvas.height * SCALE - 3]]);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
  for (const pixel of image.pixels) for (const channel of pixel) expect(channel).toBeGreaterThanOrEqual(250);
});

test('[ST-02] 흑백 PNG는 색칠한 노드를 같은 휘도의 회색으로 내보낸다', {
  tag: ['@SPEC-6.1'],
}, async ({ page }) => {
  const canvas = await prepareInvoice(page);

  const file = await exportAs(page, 'PNG', '흑백');

  expect(file.name).toBe('diagram.png');
  expect([...file.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = await decode(page, file.bytes, 'image/png', [[(canvas.x + 10) * SCALE, (canvas.y + 10) * SCALE]]);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
  // #fff0ce의 BT.601 휘도 = round(0.299·255 + 0.587·240 + 0.114·206) = 241
  expect(image.pixels[0]).toEqual([241, 241, 241]);
});

test('[ST-02] 흑백 JPG는 모든 픽셀의 RGB 채널이 같다', {
  tag: ['@SPEC-6.1'],
}, async ({ page }) => {
  const canvas = await prepareInvoice(page);

  const file = await exportAs(page, 'JPG', '흑백');

  expect(file.name).toBe('diagram.jpg');
  expect([...file.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  const inside: [number, number] = [(canvas.x + 10) * SCALE, (canvas.y + 10) * SCALE];
  const image = await decode(page, file.bytes, 'image/jpeg', [[2, 2], inside]);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
  // JPEG 손실 압축 오차를 허용한다.
  for (const [r, g, b] of image.pixels) expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(2);
  expect(image.pixels[1][0]).toBeGreaterThanOrEqual(236);
  expect(image.pixels[1][0]).toBeLessThanOrEqual(246);
});

// 새 페이지에서 코드를 한 번 입력하면 revision 1이다. 클래스 다이어그램은 자동 배치(ELK)가 끝나면 revision 2가 된다.
async function openCode(page: Page, code: string, settledRevision: 1 | 2) {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  await source(page).fill(code);
  await expect(page.locator('.feedback.error')).toHaveCount(0);
  await expect(page.getByText(new RegExp(`^revision ${settledRevision} ·`))).toBeVisible();
  const viewBox = await page.locator('svg.diagram-svg').getAttribute('viewBox');
  if (!viewBox) throw new Error('캔버스에 viewBox가 없습니다.');
  const [, , width, height] = viewBox.split(' ').map(Number);
  return { width, height };
}

test('[ST-02] 시퀀스 다이어그램도 PNG로 내보낸다', {
  tag: ['@SPEC-6.1', '@SPEC-1.3'],
}, async ({ page }) => {
  const canvas = await openCode(page, 'sequenceDiagram\n  participant Customer as 고객\n  participant Server\n  Customer->>Server: 주문', 1);
  await expect(page.locator('g.canvas-node')).toHaveCount(2);

  const file = await exportAs(page, 'PNG');

  expect(file.name).toBe('diagram.png');
  expect([...file.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const image = await decode(page, file.bytes, 'image/png', []);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
});

test('[ST-02] 객체 30개 다이어그램도 잘리지 않고 모든 노드를 담는다', {
  tag: ['@SPEC-6.1', '@SPEC-9.2'],
}, async ({ page }) => {
  const code = ['classDiagram', ...Array.from({ length: 30 }, (_, i) => `  class Node${i}`)].join('\n');
  const canvas = await openCode(page, code, 2);
  await expect(page.locator('g.canvas-node')).toHaveCount(30);
  const boxes = await page.locator('g.canvas-node .node-box').evaluateAll(rects => rects.map(rect =>
    ['x', 'y', 'width', 'height'].map(name => Number(rect.getAttribute(name)))));
  // 가장 오른쪽 아래에 있는 노드의 왼쪽 테두리(진한 선)를 이미지에서 찾는다.
  const [x, y, , height] = boxes.reduce((far, box) => box[0] + box[2] + box[1] + box[3] > far[0] + far[2] + far[1] + far[3] ? box : far);
  expect(boxes.every(([bx, by, bw, bh]) => bx + bw <= canvas.width && by + bh <= canvas.height)).toBe(true);

  const file = await exportAs(page, 'PNG');

  const image = await decode(page, file.bytes, 'image/png', [[x * SCALE, (y + height / 2) * SCALE]]);
  expect(image.width).toBe(canvas.width * SCALE);
  expect(image.height).toBe(canvas.height * SCALE);
  expect(Math.max(...image.pixels[0])).toBeLessThan(200);
});
