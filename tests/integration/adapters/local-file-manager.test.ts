// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileManager } from '../../../src/adapters/local-file-manager';
import { isAbortError } from '../../../src/adapters/download-blob';
import { fakeSavePicker } from './fake-save-picker';

const SOURCE = 'classDiagram\r\n  class 주문 %% 한글과 CRLF\r\n';

describe('LocalFileManager: 작업 파일 저장 [SPEC-5.1]', () => {
  afterEach(() => {
    window.showSaveFilePicker = undefined;
    vi.restoreAllMocks();
  });

  it('처음 저장할 때만 저장 창을 띄우고, 다음 저장은 같은 파일에 덮어쓴다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();

    await files.write('first');
    await files.write('second');

    expect(picker.show).toHaveBeenCalledTimes(1);
    expect(picker.show).toHaveBeenCalledWith({
      suggestedName: 'diagram.mmd',
      types: [{ description: 'Mermaid 작업 파일', accept: { 'text/plain': ['.mmd'] } }],
    });
    expect(await Promise.all(picker.written.map(blob => blob.text()))).toEqual(['first', 'second']);
  });

  it('reset 후 저장하면 다시 저장 창을 띄운다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();

    await files.write('first');
    files.reset();
    await files.write('other document');

    expect(picker.show).toHaveBeenCalledTimes(2);
  });

  it('저장 창을 닫으면 AbortError로 실패하고, 다음 저장에서 다시 저장 창을 띄운다', async () => {
    const picker = fakeSavePicker();
    picker.show.mockRejectedValueOnce(new DOMException('사용자가 저장 창을 닫음', 'AbortError'));
    const files = new LocalFileManager();

    const failure = await files.write('first').catch((error: unknown) => error);
    await files.write('second');

    expect(isAbortError(failure)).toBe(true);
    expect(picker.show).toHaveBeenCalledTimes(2);
    expect(picker.written).toHaveLength(1);
  });

  it('쓰기에 실패한 파일은 기억하지 않아 다음 저장에서 다시 저장 창을 띄운다', async () => {
    const picker = fakeSavePicker();
    picker.writable.write.mockRejectedValueOnce(new Error('권한 없음'));
    const files = new LocalFileManager();

    await expect(files.write('first')).rejects.toThrow('권한 없음');
    await files.write('second');

    expect(picker.show).toHaveBeenCalledTimes(2);
  });

  it('기억해 둔 파일에 쓰기가 실패하면(삭제·권한 회수) 그 파일을 잊고 다음 저장에서 저장 창을 다시 띄운다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();
    await files.write('first');
    picker.writable.write.mockRejectedValueOnce(new DOMException('파일이 없음', 'NotFoundError'));

    await expect(files.write('second')).rejects.toThrow('파일이 없음');
    await files.write('third');

    expect(picker.show).toHaveBeenCalledTimes(2);
    expect(await Promise.all(picker.written.map(blob => blob.text()))).toEqual(['first', 'third']);
  });

  it('쓰는 도중 reset되면 끝난 쓰기의 파일을 기억하지 않아 새 문서의 첫 저장은 저장 창을 띄운다', async () => {
    const picker = fakeSavePicker();
    let finish!: () => void;
    picker.writable.write.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const files = new LocalFileManager();

    const saving = files.write('document A');
    await vi.waitFor(() => expect(picker.writable.write).toHaveBeenCalledTimes(1));
    files.reset();
    finish();
    await saving;
    await files.write('document B');

    expect(picker.show).toHaveBeenCalledTimes(2);
  });

  it('저장 창이 없는 브라우저는 diagram.mmd 다운로드를 요청한다', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mmd'), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('diagram.mmd');
    });

    await new LocalFileManager().write(SOURCE);

    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('LocalFileManager: 저장 → 열기 왕복 [SPEC-5.1][SPEC-5.2]', () => {
  afterEach(() => { window.showSaveFilePicker = undefined; });

  it('한글과 CRLF가 든 원문을 저장한 파일을 다시 읽으면 원문이 그대로다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();

    await files.write(SOURCE);

    expect(await files.read(picker.written[0])).toBe(SOURCE);
  });
});
