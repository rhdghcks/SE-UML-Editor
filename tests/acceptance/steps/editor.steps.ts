import { expect } from '@playwright/test';
import { createBdd } from 'playwright-bdd';

const { Given, When, Then } = createBdd();

const source = (page: import('@playwright/test').Page) => page.getByRole('textbox', { name: 'Mermaid 코드' });
const nodeRect = (page: import('@playwright/test').Page, name: string) =>
  page.locator('g.canvas-node').filter({ hasText: name }).locator('rect');
const unescape = (text: string) => text.replaceAll('\\n', '\n');

// 시나리오 사이에서 공유하는 값 (Playwright는 시나리오마다 새 page를 만든다)
let draggedX: string | null = null;

Given('사용자가 편집기를 열었다', async ({ page }) => {
  draggedX = null;
  // OS 저장 창은 자동화할 수 없다. 저장 창이 없는 브라우저처럼 만들어 다운로드 경로로 파일을 받는다.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
});

Given('코드에 {string}를 입력했다', async ({ page }, code: string) => {
  await source(page).fill(unescape(code));
});

When('{string}를 오른쪽 아래로 드래그한다', async ({ page }, name: string) => {
  const box = await nodeRect(page, name).boundingBox();
  if (!box) throw new Error(`${name}이(가) 캔버스에 없습니다.`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 42, y + 24, { steps: 5 });
  await page.mouse.up();
  await expect(source(page)).toHaveValue(/"placement":"manual"/);
  draggedX = await nodeRect(page, name).getAttribute('x');
});

When('코드를 {string}로 바꾼다', async ({ page }, code: string) => {
  await source(page).fill(unescape(code));
});

When('파일을 저장한 뒤 다른 예제를 열었다가 저장한 파일을 다시 연다', async ({ page }) => {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장' }).click();
  const path = await (await downloading).path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  await page.getByRole('button', { name: '시퀀스 예제' }).click();
  await page.locator('input[type=file]').setInputFiles(path);
});

Then('{string}는 드래그한 위치에 있다', async ({ page }, name: string) => {
  expect(draggedX).not.toBeNull();
  await expect(nodeRect(page, name)).toHaveAttribute('x', draggedX!);
});

Then('캔버스에 {string}가 보인다', async ({ page }, name: string) => {
  await expect(page.locator('g.canvas-node').filter({ hasText: name })).toHaveCount(1);
});
