import { expect, test } from '@playwright/test';

test('class layout displays saved bends and keeps the routed edge after code edits', async ({ page }) => {
  await page.goto('/');
  const code = page.getByRole('textbox', { name: 'Mermaid 코드' });
  const route = { key: JSON.stringify(['class:A', '-->', 'class:B', 0]), points: [{ x: 320, y: 350 }] };
  await code.fill('classDiagram\nA --> B\n%% @se-uml-route ' + JSON.stringify(route));
  const edge = page.locator('svg.diagram-svg polyline').first();
  await expect(edge).toHaveAttribute('points', /320,350/);
  await code.fill('classDiagram\nA --> B\nB --> C');
  await expect(edge).toHaveAttribute('points', /320,350/);
  await expect(page.locator('g.canvas-node')).toHaveCount(3);
});

for (const [header, keyword] of [['classDiagram', 'class'], ['sequenceDiagram', 'participant']]) {
  test(header + ' renders 30 objects within one second and undoes an invalid draft', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'Mermaid 코드' });
    const source = [header, ...Array.from({ length: 30 }, (_, i) => keyword + ' Node' + i)].join('\n');
    await editor.evaluate(element => {
      element.addEventListener('input', () => performance.mark('source-input'), { once: true, capture: true });
    });
    await editor.fill(source);
    const elapsed = await page.evaluate(async () => {
      const start = performance.getEntriesByName('source-input')[0].startTime;
      do {
        await new Promise(requestAnimationFrame);
        if (document.querySelectorAll('g.canvas-node').length === 30) break;
      } while (performance.now() - start < 1000);
      return performance.now() - start;
    });
    expect(elapsed).toBeLessThan(1000);
    await expect(page.locator('g.canvas-node')).toHaveCount(30);
    await editor.fill(source + '\n' + keyword + ' Overflow');
    await expect(page.locator('.feedback.error')).toContainText('30');
    await expect(page.locator('g.canvas-node')).toHaveCount(30);
    await editor.press('Control+z');
    await expect(editor).toHaveValue(source);
    await expect(page.locator('.feedback.error')).toHaveCount(0);
  });
}
