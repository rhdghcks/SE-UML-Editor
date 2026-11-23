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
