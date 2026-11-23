import { createElement } from 'react';
import type { IRenderer } from '../core/contracts';
import type { DiagramDocument } from '../core/types';
import { DiagramCanvas } from '../ui/DiagramCanvas';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = 'Arial, sans-serif';

/**
 * 편집 캔버스와 같은 그림(수동 좌표·색상 반영)을 단독 SVG 문자열로 만든다.
 * 화면의 CSS가 없어도 같은 크기·글꼴로 보이도록 xmlns, width, height, font-family를 붙인다.
 */
export class CanvasSvgRenderer implements IRenderer<string> {
  async render(document: DiagramDocument) {
    // react-dom/server는 약 200kB라 내보낼 때만 불러온다. 정적 import하면 첫 화면 번들이 두 배가 된다.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const markup = renderToStaticMarkup(createElement(DiagramCanvas, {
      document, disabled: true, selected: null, onSelect: () => {}, onMove: () => {},
    }));
    const viewBox = /^<svg[^>]*\sviewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(markup);
    if (!viewBox) throw new Error('캔버스 SVG의 크기(viewBox)를 찾을 수 없습니다.');
    const [, width, height] = viewBox;
    return markup.replace(/^<svg/,
      `<svg xmlns="${SVG_NS}" width="${width}" height="${height}" font-family="${FONT_FAMILY}"`);
  }
}
