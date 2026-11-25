import { describe, expect, it } from 'vitest';
import { CanvasSvgRenderer } from '../../../src/adapters/canvas-svg-renderer';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import { DiagramStore } from '../../../src/core/diagram-store';
import { writeSequenceOffset } from '../../../src/core/route-editing';
import { sequenceRouteKeys } from '../../../src/core/diagram-geometry';

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

    it('선택 강조 없이 그린다 (내보낸 그림에 선택 테두리가 남지 않는다)', async () => {
      const svg = await renderer.render(open('classDiagram\n  class Invoice').getSnapshot());
      expect(svg).not.toContain('stroke="#3367d6"');
    });

    it('수직 이동한 메시지와 뒤따르는 활성화 설명의 높이를 내보낸다 [SPEC-2.2][SPEC-1.3]', async () => {
      const store = open('sequenceDiagram\nUser->>Server: login\nactivate Server\nServer-->>User: token\ndeactivate Server');
      const current = store.getSnapshot();
      if (current.model.kind !== 'sequence') throw new Error('Expected sequence');
      const key = sequenceRouteKeys(current.model.steps)[0];
      store.updateSource(writeSequenceOffset(current.source, key, 100));
      const svg = await renderer.render(store.getSnapshot());
      expect(svg).toMatch(/<polyline[^>]*class="edge-line"[^>]*points="[^,]+,300 [^,]+,300"/);
      expect(svg).toMatch(/<text[^>]*y="324"[^>]*>activate: Server<\/text>/);
      expect(svg).not.toContain('class="bend-handle"');
    });

    it('시퀀스 참여자의 이동을 내보낸 활성화·분기 설명에도 반영한다 [SPEC-1.3][SPEC-2.1]', async () => {
      const store = open('sequenceDiagram\nUser->>Server: login\nactivate Server\nServer-->>User: token\ndeactivate Server\nalt valid\nUser->>Server: next\nelse expired\nServer-->>User: no\nend');
      store.moveNode('participant:User', 610, 70);
      store.moveNode('participant:Server', 450, 90);
      store.resizeNode('participant:Server', 190, 70);
      const svg = await renderer.render(store.getSnapshot());
      expect(svg).toMatch(/<text[^>]*x="529"[^>]*text-anchor="end"[^>]*>activate: Server<\/text>/);
      expect(svg).toMatch(/<text[^>]*x="529"[^>]*text-anchor="end"[^>]*>deactivate: Server<\/text>/);
      expect(svg).toMatch(/<text[^>]*x="529"[^>]*>alt: valid<\/text>/);
    });
  });
});
