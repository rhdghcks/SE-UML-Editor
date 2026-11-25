import { test, expect } from '@playwright/test';

test('[TC-CODE-1.1-01] 편집, GUI 색상, Undo, 공식 SVG 미리보기', {
  tag: ['@SPEC-1.1', '@SPEC-1.3', '@SPEC-4.1', '@SPEC-5.3'],
}, async ({ page }) => {
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
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '시퀀스 예제' }).click();
  await expect(page.getByRole('img', { name: 'Mermaid 자동 배치 결과' })).toBeVisible();
});

test('[TC-CODE-1.3-01] Mermaid adapter updates the team canvas and reports unsupported syntax with its source line', {
  tag: ['@SPEC-1.3', '@SPEC-1.2'],
}, async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await editor.fill('classDiagram\nclass Order\nOrder : +total()\nOrder --> Customer : places');
  await expect(page.locator('.canvas-node').filter({ hasText: 'Order' })).toContainText('+total()');
  await expect(page.locator('.canvas-node').filter({ hasText: 'Customer' })).toHaveCount(1);

  await editor.fill('sequenceDiagram\nparticipant A as 고객\nparticipant B\nalt 승인\nloop 재시도\nA->>B: 요청\nend\nelse 거절\nB-->>A: 응답\nend');
  await expect(page.locator('.canvas-node').filter({ hasText: '고객' })).toHaveCount(1);
  await expect(page.getByText('loop: 재시도')).toBeVisible();
  await expect(page.getByText('응답', { exact: true })).toBeVisible();

  await editor.fill('sequenceDiagram\n%% 사용자 주석\nbreak 중단\nA->>B: 요청\nend');
  await expect(page.locator('.feedback.error')).toContainText('3행');
  await expect(page.getByText('응답', { exact: true })).toBeVisible();
});

test('[TC-CODE-1.3-02] shows critical options in the team canvas and retains their syntax in the official preview', {
  tag: ['@SPEC-1.3'],
}, async ({ page }) => {
  await page.goto('/');
  const code = 'sequenceDiagram\ncritical 결제 승인\ncritical 재고 확인\nA->>B: 요청\nend\noption 시간 초과\nB-->>A: 대기\noption 권한 거부\nB-->>A: 실패\nend';
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await editor.fill(code);
  await expect(page.getByText('critical: 결제 승인')).toBeVisible();
  await expect(page.getByText('critical: 재고 확인')).toBeVisible();
  await expect(page.getByText('option: 시간 초과')).toBeVisible();
  await expect(page.getByText('option: 권한 거부')).toBeVisible();
  await page.getByRole('button', { name: 'Mermaid 미리보기' }).click();
  const preview = page.getByRole('img', { name: 'Mermaid 자동 배치 결과' });
  await expect(preview).toBeVisible();
  const svgSource = () => preview.evaluate((image: HTMLImageElement) =>
    fetch(image.src).then(response => response.text()).catch(() => ''));
  await expect.poll(svgSource).toContain('권한 거부');
  await editor.fill(code.replace('권한 거부', '취소'));
  await expect.poll(svgSource).toContain('취소');
});

test('[TC-CODE-1.2-01] reports an inactive participant at its original line and keeps the previous canvas', {
  tag: ['@SPEC-1.2'],
}, async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const normal = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: keep';
  await editor.fill(normal);
  await expect(page.getByText('keep', { exact: true })).toBeVisible();
  await editor.fill(normal + '\n%% comment\n\ndeactivate B');
  await expect(page.locator('.feedback.error')).toContainText('7행: 활성화되지 않은 참여자: B');
  await expect(page.getByText('keep', { exact: true })).toBeVisible();
});
