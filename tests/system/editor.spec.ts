import { test, expect } from '@playwright/test';

test('[TC-CODE-1.1-01] 편집, GUI 색상, Undo, 공식 SVG 미리보기', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '클래스 예제' }).click();
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await source.fill('classDiagram\n  class Invoice');
  const node = page.locator('g.canvas-node').filter({ hasText: 'Invoice' });
  await expect(node).toHaveCount(1);
  await node.click();
  await page.getByTitle('#e8eefb').click();
  await expect(source).toHaveValue(/@se-uml-layout/);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(source).toHaveValue('classDiagram\n  class Invoice');
  await page.getByRole('button', { name: 'Mermaid 미리보기' }).click();
  await expect(page.getByRole('img', { name: 'Mermaid 자동 배치 결과' })).toBeVisible();
  await page.getByRole('button', { name: '시퀀스 예제' }).click();
  await expect(page.getByRole('img', { name: 'Mermaid 자동 배치 결과' })).toBeVisible();
});

// TC-SYNC-3.1-01(드래그 → 코드 편집 → 파일 재열기)은 인수 TC-SYNC-3.1-02, TC-FILE-5.2-01과 중복되어 삭제했다.
