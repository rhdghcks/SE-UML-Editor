import { describe, expect, it } from 'vitest';
import { grayscaleBlob, toGrayscale } from '../../../src/adapters/grayscale-image';

describe('흑백 변환: 픽셀 계산과 입력 검증 [SPEC-6.1]', () => {
  describe('블랙박스:', () => {
    it.each([
      [[255, 0, 0, 255], 76],
      [[0, 255, 0, 255], 150],
      [[0, 0, 255, 255], 29],
      [[0xff, 0xf0, 0xce, 255], 241],
      [[255, 255, 255, 255], 255],
      [[0, 0, 0, 255], 0],
    ])('RGB %j는 휘도 %i의 회색이 된다', (rgba, luma) => {
      const pixels = new Uint8ClampedArray(rgba);
      toGrayscale(pixels);
      expect([...pixels]).toEqual([luma, luma, luma, 255]);
    });

    it('알파는 바꾸지 않고 모든 픽셀을 변환한다', () => {
      const pixels = new Uint8ClampedArray([255, 0, 0, 0, 0, 0, 255, 128]);
      toGrayscale(pixels);
      expect([...pixels]).toEqual([76, 76, 76, 0, 29, 29, 29, 128]);
    });
  });

  describe('오류 품질:', () => {
    it('RGBA 길이가 4의 배수가 아니면 거부한다', () => {
      expect(() => toGrayscale(new Uint8ClampedArray(3))).toThrow(/4의 배수.*3/);
    });

    it.each(['image/gif', ''])('PNG·JPEG가 아닌 Blob(%j)은 디코딩 전에 거부한다', async (type) => {
      await expect(grayscaleBlob(new Blob(['x'], { type }))).rejects.toThrow(/흑백으로 바꿀 수 없는 이미지 형식/);
    });
  });
});
