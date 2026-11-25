import { describe, expect, it } from 'vitest';
import { CanvasSvgRenderer } from '../../../src/adapters/canvas-svg-renderer';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import { DiagramStore } from '../../../src/core/diagram-store';
import { routeKeys } from '../../../src/core/manual-routes';
import { writeRoute } from '../../../src/core/route-editing';

const renderer = new CanvasSvgRenderer();
const open = (source: string) => new DiagramStore(new BasicMermaidParser(), new GridLayout(), source);
const attr = (svg: string, name: string) => new RegExp(`^<svg[^>]*\\s${name}="([^"]*)"`).exec(svg)?.[1];

describe('CanvasSvgRenderer: 편집 캔버스를 단독 SVG로 만든다 [SPEC-6.1]', () => {
  describe('smoke:', () => {
    it.each([
      ['클래스', 'classDiagram\n  class User\n  class Session\n  User --> Session : creates', ['User', 'Session', 'creates']],
      ['시퀀스', 'sequenceDiagram\n  participant User\n  participant Server\n  User->>Server: login()', ['User', 'Server', 'login()']],
    ])('%s 다이어그램의 이름과 라벨이 SVG에 들어간다', async (_, source, texts) => {
      const svg = await renderer.render(open(source).getSnapshot());
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      for (const text of texts) expect(svg).toContain(`>${text}<`);
    });
  });

  describe('블랙박스:', () => {
    it('수동으로 옮긴 좌표와 바꾼 색상이 그대로 그려진다', async () => {
      const store = open('classDiagram\n  class Invoice');
      store.moveNode('class:Invoice', 517, 333);
      store.setNodeColor('class:Invoice', '#fff0ce');
      const svg = await renderer.render(store.getSnapshot());
      expect(svg).toMatch(/<rect[^>]* x="517" y="333"[^>]*fill="#fff0ce"/);
    });

    it('CSS 없이도 같은 크기·글꼴이 되도록 width·height를 viewBox와 맞추고 font-family를 붙인다', async () => {
      const store = open('classDiagram\n  class Invoice');
      store.moveNode('class:Invoice', 1500, 900);
      const svg = await renderer.render(store.getSnapshot());
      const [, , w, h] = attr(svg, 'viewBox')!.split(' ').map(Number);
      expect(Number(attr(svg, 'width'))).toBe(w);
      expect(Number(attr(svg, 'height'))).toBe(h);
      expect(w).toBeGreaterThan(1500);
      expect(h).toBeGreaterThan(900);
      expect(attr(svg, 'font-family')).toBe('Arial, sans-serif');
    });

    it('[UT-07] 바꾼 노드 크기와 간선 꺾임점이 그대로 그려진다 [SPEC-2.3][SPEC-2.4]', async () => {
      const store = open('classDiagram\n  class Order\n  class Customer\n  Order --> Customer');
      store.moveNode('class:Order', 60, 70);
      store.resizeNode('class:Order', 260, 140);
      const { model } = store.getSnapshot();
      if (model.kind !== 'class') throw new Error('클래스 다이어그램이 아닙니다.');
      store.updateSource(writeRoute(store.getSnapshot().source, routeKeys(model.relations)[0],
        [{ x: 420, y: 400 }, { x: 610, y: 400 }]));

      const svg = await renderer.render(store.getSnapshot());
      const rect = /<g data-node-id="class:Order"[^>]*>\s*<rect([^>]*)>/.exec(svg)?.[1] ?? '';
      const attrs = Object.fromEntries([...rect.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
      expect(attrs).toMatchObject({ x: '60', y: '70', width: '260', height: '140' });
      const line = /<polyline[^>]*class="edge-line"[^>]*>/.exec(svg)?.[0] ?? '';
      const points = (/points="([^"]*)"/.exec(line)?.[1] ?? '').split(' ').map(point => point.split(',').map(Number));
      expect(points.slice(1, -1)).toEqual([[420, 400], [610, 400]]);
    });

    it('[UT-08] <, &, 한글, 이모지가 든 라벨도 깨지지 않는 SVG로 만든다 [SPEC-1.3]', async () => {
      const store = open([
        'sequenceDiagram',
        '  participant A as 고객 😀',
        '  participant B',
        '  A->>B: x < y & "z"',
      ].join('\n'));

      const svg = await renderer.render(store.getSnapshot());

      expect(svg).toContain('>고객 😀<');
      expect(svg).toContain('x &lt; y &amp; &quot;z&quot;');
      const texts = [...svg.matchAll(/>([^<]*)</g)].map(match => match[1]);
      for (const text of texts) expect(text).not.toMatch(/&(?!(?:lt|gt|amp|quot|#x?[0-9a-f]+);)/i);
    });

    it('선택 강조 없이 그린다 (내보낸 그림에 선택 테두리가 남지 않는다)', async () => {
      const svg = await renderer.render(open('classDiagram\n  class Invoice').getSnapshot());
      expect(svg).not.toContain('stroke="#3367d6"');
    });
  });
});
