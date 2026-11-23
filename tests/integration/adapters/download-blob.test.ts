// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../../src/adapters/download-blob';

// jsdom에는 Blob URL과 실제 다운로드가 없다. 파일이 실제로 받아지는지는 tests/system/export.spec.ts가 검증한다.
// 여기서는 링크에 넘기는 값과 URL 해제 시점만 검사한다.
describe('downloadBlob: 이미지 다운로드 요청 [SPEC-6.1]', () => {
  const created = vi.fn(() => 'blob:mock-url');
  const revoked = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    created.mockClear();
    revoked.mockClear();
  });

  it('Blob URL과 파일 이름을 링크에 넣어 클릭하고, 1초 뒤 URL을 해제한다', () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:mock-url');
      expect(this.download).toBe('diagram.png');
    });

    downloadBlob(blob, 'diagram.png');

    expect(created).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledWith('blob:mock-url');
  });

  it('클릭이 실패해도 오류를 그대로 던지고 URL은 해제한다', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('다운로드 차단'); });

    expect(() => downloadBlob(new Blob(['x']), 'diagram.jpg')).toThrow('다운로드 차단');
    vi.advanceTimersByTime(1000);
    expect(revoked).toHaveBeenCalledWith('blob:mock-url');
  });
});
