import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const SCALE = 2;
const source = (page: Page) => page.getByRole('textbox', { name: 'Mermaid 코드' });
const invoiceRect = (page: Page) => page.locator('g.canvas-node').filter({ hasText: 'Invoice' }).locator('rect');

async function prepareInvoice(page: Page) {
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

async function exportAs(page: Page, label: 'PNG' | 'JPG') {
  await page.getByRole('button', { name: '내보내기' }).click();
  await page.getByRole('radio', { name: label }).check();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '이미지 저장' }).click();
  const download = await downloading;
  const path = await download.path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  return { name: download.suggestedFilename(), bytes: await readFile(path) };
}

/** 브라우저에서 이미지를 디코딩해 크기와 지정 좌표의 RGB를 읽는다. */
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

test('[TC-EXPORT-6.1-01] 수동 배치·색상을 반영한 PNG 내보내기', {
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

test('[TC-EXPORT-6.1-02] JPG 내보내기는 흰 배경의 JPEG 파일을 만든다', {
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
