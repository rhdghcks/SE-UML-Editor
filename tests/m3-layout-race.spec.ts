import { expect, test } from '@playwright/test';

test('layout finishing during a drag does not cancel the move or add an undo step', async ({ page }) => {
  let releaseModule!: () => void;
  let requested!: () => void;
  const held = new Promise<void>(resolve => { releaseModule = resolve; });
  const loading = new Promise<void>(resolve => { requested = resolve; });
  // Control only the asynchronous layout dependency, not application state or pointer handlers.
  await page.route(/\/elk\.bundled-[^/]+\.js(?:\?.*)?$/, async route => {
    requested();
    await held;
    await route.fulfill({ contentType: 'application/javascript', body: `
      class ELK {
        async layout(graph) {
          document.documentElement.dataset.m3LayoutCalculated = 'true';
          return { ...graph, children: graph.children.map(node => ({ ...node, x: 500, y: 200 })) };
        }
      }
      export default ELK;
      export const e = { default: ELK };
    ` });
  });
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const source = 'classDiagram\nclass Invoice';
  await editor.fill(source);
  await loading;
  const node = page.locator('[data-node-id="class:Invoice"] .node-box');
  const before = await node.boundingBox();
  if (!before) throw new Error('Invoice is not visible');
  const x = before.x + before.width / 2, y = before.y + before.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  releaseModule();
  await page.waitForSelector('html[data-m3-layout-calculated="true"]', { state: 'attached' });
  // Allow a completed layout to reach React before continuing the pointer gesture.
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  await expect(node).toHaveAttribute('x', '60');
  await expect(node).toHaveAttribute('y', '70');
  await page.mouse.move(x + 42, y + 24, { steps: 5 });
  await page.mouse.up();
  await expect(editor).toHaveValue(/"placement":"manual"/);
  await expect(node).not.toHaveAttribute('x', '548');
  const moved = await node.getAttribute('x');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor).toHaveValue(source);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(node).toHaveAttribute('x', moved!);
});
