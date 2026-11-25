// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, isAbortError, saveBlob } from '../../../src/adapters/download-blob';
import { fakeSavePicker } from './fake-save-picker';

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

describe('saveBlob: 저장 위치를 고른 뒤 이미지 저장 [SPEC-6.1]', () => {
  afterEach(() => {
    window.showSaveFilePicker = undefined;
    vi.restoreAllMocks();
  });

  it('저장 창을 먼저 띄우고, 고른 파일에 produce()가 만든 이미지를 쓴다', async () => {
    const picker = fakeSavePicker();
    const order: string[] = [];
    picker.show.mockImplementation(async () => { order.push('저장 창'); return picker.handle; });
    const blob = new Blob(['png'], { type: 'image/png' });

    await saveBlob('diagram.png', async () => { order.push('이미지 생성'); return blob; });

    expect(order).toEqual(['저장 창', '이미지 생성']);
    expect(picker.show).toHaveBeenCalledWith({
      suggestedName: 'diagram.png',
      types: [{ description: 'PNG 이미지', accept: { 'image/png': ['.png'] } }],
    });
    expect(picker.written).toEqual([blob]);
    expect(picker.writable.close).toHaveBeenCalledTimes(1);
  });

  it('저장 창을 닫으면 이미지를 만들지 않고 AbortError로 실패한다', async () => {
    const picker = fakeSavePicker();
    picker.show.mockRejectedValue(new DOMException('사용자가 저장 창을 닫음', 'AbortError'));
    const produce = vi.fn(async () => new Blob(['png']));

    const failure = await saveBlob('diagram.png', produce).catch((error: unknown) => error);

    expect(isAbortError(failure)).toBe(true);
    expect(produce).not.toHaveBeenCalled();
  });

  it('파일 쓰기가 실패하면 쓰던 내용을 버리고 오류를 그대로 던진다', async () => {
    const picker = fakeSavePicker();
    picker.writable.write.mockRejectedValue(new Error('디스크 가득 참'));

    await expect(saveBlob('diagram.jpg', async () => new Blob(['jpg']))).rejects.toThrow('디스크 가득 참');
    expect(picker.writable.abort).toHaveBeenCalledTimes(1);
    expect(picker.writable.close).not.toHaveBeenCalled();
  });

  it('abort까지 실패해도 원래 쓰기 오류를 던진다', async () => {
    const picker = fakeSavePicker();
    picker.writable.write.mockRejectedValue(new Error('디스크 가득 참'));
    picker.writable.abort.mockRejectedValue(new Error('abort 실패'));

    await expect(saveBlob('diagram.png', async () => new Blob(['png']))).rejects.toThrow('디스크 가득 참');
  });

  it('close가 실패하면 쓰던 내용을 버리고 close 오류를 던진다', async () => {
    const picker = fakeSavePicker();
    picker.writable.close.mockRejectedValue(new Error('닫기 실패'));

    await expect(saveBlob('diagram.png', async () => new Blob(['png']))).rejects.toThrow('닫기 실패');
    expect(picker.writable.abort).toHaveBeenCalledTimes(1);
  });

  it('저장 창이 없는 브라우저는 produce()의 결과를 다운로드한다', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fallback'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('diagram.jpg');
    });

    await saveBlob('diagram.jpg', async () => new Blob(['jpg']));

    expect(click).toHaveBeenCalledTimes(1);
  });

  it('AbortError가 아닌 오류는 취소로 보지 않는다', () => {
    expect(isAbortError(new DOMException('실패', 'NotAllowedError'))).toBe(false);
    expect(isAbortError(new Error('AbortError'))).toBe(false);
  });
});
