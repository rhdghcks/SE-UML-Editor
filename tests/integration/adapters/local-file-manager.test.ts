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

  const suggested = (picker: ReturnType<typeof fakeSavePicker>) =>
    picker.show.mock.calls.map(([options]) => options?.suggestedName);

  it('[IT-15] 저장할 때마다 저장 창을 띄우고 diagram.mmd → diagram(1).mmd → diagram(2).mmd 순서로 새 파일 이름을 제안한다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();

    await files.write('first');
    await files.write('second');
    await files.write('third');

    expect(suggested(picker)).toEqual(['diagram.mmd', 'diagram(1).mmd', 'diagram(2).mmd']);
    expect(picker.show).toHaveBeenCalledWith({
      suggestedName: 'diagram.mmd',
      types: [{ description: 'Mermaid 작업 파일', accept: { 'text/plain': ['.mmd'] } }],
    });
    // 저장마다 저장 창이 고른 새 파일에 쓴다. 앞서 저장한 파일을 다시 쓰지 않는다.
    expect(picker.handle.createWritable).toHaveBeenCalledTimes(3);
    expect(await Promise.all(picker.written.map(blob => blob.text()))).toEqual(['first', 'second', 'third']);
  });

  it('[IT-15] 저장 창을 닫으면 AbortError로 실패하고, 다음 저장은 같은 이름을 다시 제안한다', async () => {
    const picker = fakeSavePicker();
    const files = new LocalFileManager();
    await files.write('first');
    picker.show.mockRejectedValueOnce(new DOMException('사용자가 저장 창을 닫음', 'AbortError'));

    const failure = await files.write('second').catch((error: unknown) => error);
    await files.write('second');

    expect(isAbortError(failure)).toBe(true);
    expect(suggested(picker)).toEqual(['diagram.mmd', 'diagram(1).mmd', 'diagram(1).mmd']);
    expect(picker.written).toHaveLength(2);
  });

  it('[IT-15] 쓰기에 실패하면 오류를 그대로 던지고, 다음 저장은 같은 이름을 다시 제안한다', async () => {
    const picker = fakeSavePicker();
    picker.writable.write.mockRejectedValueOnce(new Error('권한 없음'));
    const files = new LocalFileManager();

    await expect(files.write('first')).rejects.toThrow('권한 없음');
    await files.write('first');

    expect(suggested(picker)).toEqual(['diagram.mmd', 'diagram.mmd']);
    expect(picker.writable.abort).toHaveBeenCalledTimes(1);
  });

  it('[IT-15] 저장 창이 없는 브라우저는 같은 순서의 이름으로 다운로드를 요청한다', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mmd'), revokeObjectURL: vi.fn() });
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    const files = new LocalFileManager();

    await files.write(SOURCE);
    await files.write(SOURCE);

    expect(names).toEqual(['diagram.mmd', 'diagram(1).mmd']);
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
