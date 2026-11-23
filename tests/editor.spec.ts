import { test, expect } from '@playwright/test';

test('편집, GUI 색상, Undo, 공식 SVG 미리보기', async ({ page }) => {
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

test('드래그 → 코드 편집 → 저장 파일 재열기에서 수동 배치 보존', async ({ page }) => {
  await page.goto('/');
  const source = page.getByRole('textbox', { name: 'Mermaid 코드' });
  await source.fill('classDiagram\nclass Invoice');
  const box = await page.locator('g.canvas-node rect').boundingBox();
  if (!box) throw new Error('Invoice가 화면에 없습니다.');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 42, y + 24, { steps: 5 });
  await page.mouse.up();
  await expect(source).toHaveValue(/"placement":"manual"/);
  const rect = page.locator('g.canvas-node').filter({ hasText: 'Invoice' }).locator('rect');
  const movedX = await rect.getAttribute('x');
  await source.fill('classDiagram\nclass Invoice\nclass Order');
  await expect(rect).toHaveAttribute('x', movedX!);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '파일 저장' }).click();
  const path = await (await downloading).path();
  if (!path) throw new Error('다운로드가 완료되지 않았습니다.');
  await page.getByRole('button', { name: '시퀀스 예제' }).click();
  await page.locator('input[type=file]').setInputFiles(path);
  await expect(rect).toHaveAttribute('x', movedX!);
  await expect(source).toHaveValue(/"placement":"manual"/);
});

test('Mermaid adapter updates the team canvas and reports unsupported syntax with its source line', async ({ page }) => {
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

test('shows critical options in the team canvas and retains their syntax in the official preview', async ({ page }) => {
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
