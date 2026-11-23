import type { IImageExporter, IRenderer } from '../core/contracts';
import type { DiagramDocument } from '../core/types';

export type ImageFormat = Parameters<IImageExporter['export']>[1];

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg' };
const JPEG_QUALITY = 0.92;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('다이어그램 SVG를 이미지로 읽지 못했습니다.'));
    image.src = url;
  });
}

/**
 * SVG 렌더러의 결과를 브라우저 canvas로 래스터화해 PNG·JPEG Blob을 만든다.
 * JPEG는 투명도를 지원하지 않으므로 흰색 배경으로 적용한다.
 */
export class SvgImageExporter implements IImageExporter {
  constructor(private readonly renderer: IRenderer<string>, private readonly scale = 2) {
    if (!(scale > 0)) throw new Error(`배율은 0보다 커야 합니다: ${scale}`);
  }

  async export(document: DiagramDocument, format: ImageFormat): Promise<Blob> {
    const mime = MIME[format];
    if (!mime) throw new Error(`지원하지 않는 이미지 형식입니다: ${String(format)}`);
    const svg = await this.renderer.render(document);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const image = await loadImage(url);
      const width = Math.round(image.naturalWidth * this.scale);
      const height = Math.round(image.naturalHeight * this.scale);
      if (!width || !height) throw new Error('다이어그램 크기가 0이라 내보낼 수 없습니다.');

      const canvas = window.document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이 브라우저에서 canvas 2D를 사용할 수 없습니다.');
      if (format === 'jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);

      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('이미지 파일을 만들지 못했습니다.')),
        mime, format === 'jpeg' ? JPEG_QUALITY : undefined));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
