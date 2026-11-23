import { describe, expect, it, vi } from 'vitest';
import { SvgImageExporter, type ImageFormat } from '../../../src/adapters/svg-image-exporter';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import { DiagramStore } from '../../../src/core/diagram-store';
import type { IRenderer } from '../../../src/core/contracts';

// 래스터화(Image·canvas·toBlob)는 브라우저 전용이라 tests/system/export.spec.ts가 검증한다.
// 여기서는 DOM에 닿기 전에 끝나는 입력 검증과 오류 전파만 검사한다.
const document = new DiagramStore(new BasicMermaidParser(), new GridLayout(), 'classDiagram\n  class A').getSnapshot();
const renderer = (): IRenderer<string> & { render: ReturnType<typeof vi.fn> } =>
  ({ render: vi.fn(async () => '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') });

describe('SvgImageExporter: 입력 검증과 오류 전파 [SPEC-6.1]', () => {
  describe('블랙박스:', () => {
    it.each([0, -1, Number.NaN])('배율 %s은 생성 시 거부한다', (scale) => {
      expect(() => new SvgImageExporter(renderer(), scale)).toThrow(/배율/);
    });

    it.each([0.5, 1, 2])('배율 %s은 허용한다', (scale) => {
      expect(() => new SvgImageExporter(renderer(), scale)).not.toThrow();
    });

    it('지원하지 않는 형식은 렌더링 전에 reject한다', async () => {
      const svg = renderer();
      const exporter = new SvgImageExporter(svg);
      await expect(exporter.export(document, 'gif' as ImageFormat)).rejects.toThrow(/지원하지 않는 이미지 형식.*gif/);
      expect(svg.render).not.toHaveBeenCalled();
    });
  });

  describe('오류 품질:', () => {
    it('렌더러가 실패하면 그 오류로 reject하고 문서를 바꾸지 않는다', async () => {
      const failing: IRenderer<string> = { render: vi.fn(async () => { throw new Error('SVG 생성 실패'); }) };
      const before = JSON.stringify(document);
      await expect(new SvgImageExporter(failing).export(document, 'png')).rejects.toThrow('SVG 생성 실패');
      expect(JSON.stringify(document)).toBe(before);
    });
  });
});
