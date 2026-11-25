import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  // OS 저장 창은 자동화할 수 없다. 저장 창이 없는 브라우저처럼 만들어 다운로드 경로로 파일을 받는다.
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }));
  await page.goto('/');
  await page.getByRole('button', { name: '클래스 예제' }).click();
});

test('[TC-FILE-5.1-01] 코드 영역에서 Ctrl+S로 작업 파일을 저장한다', {
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

test('[TC-FILE-5.3-01] 코드 영역의 Ctrl+Z와 Ctrl+Shift+Z는 코드 편집과 GUI 편집을 한 이력으로 되돌린다', {
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

test('[TC-FILE-5.2-02] 저장하지 않은 변경이 있으면 예제를 열기 전에 확인하고, 취소하면 작업을 유지한다', {
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
