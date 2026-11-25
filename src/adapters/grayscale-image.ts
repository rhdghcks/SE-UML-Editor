export type ColorMode = 'color' | 'grayscale';

const JPEG_QUALITY = 0.92;
const SUPPORTED = new Set(['image/png', 'image/jpeg']);

/**
 * RGBA 픽셀 배열을 ITU-R BT.601 휘도로 바꿔 제자리에서 흑백으로 만든다. 알파는 그대로 둔다.
 */
export function toGrayscale(pixels: Uint8ClampedArray): void {
  if (pixels.length % 4 !== 0) throw new Error(`RGBA 픽셀 배열 길이는 4의 배수여야 합니다: ${pixels.length}`);
  for (let i = 0; i < pixels.length; i += 4) {
    const luma = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = luma;
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('내보낸 이미지를 흑백으로 바꾸려고 읽지 못했습니다.'));
    image.src = url;
  });
}

/**
 * PNG·JPEG Blob을 같은 형식·크기의 흑백 이미지로 바꾼다. 브라우저 canvas가 필요하다.
 */
export async function grayscaleBlob(blob: Blob): Promise<Blob> {
  if (!SUPPORTED.has(blob.type)) throw new Error(`흑백으로 바꿀 수 없는 이미지 형식입니다: ${blob.type || '알 수 없음'}`);
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = window.document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 canvas 2D를 사용할 수 없습니다.');
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height);
    toGrayscale(data.data);
    context.putImageData(data, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      result => result ? resolve(result) : reject(new Error('흑백 이미지 파일을 만들지 못했습니다.')),
      blob.type, blob.type === 'image/jpeg' ? JPEG_QUALITY : undefined));
  } finally {
    URL.revokeObjectURL(url);
  }
}
