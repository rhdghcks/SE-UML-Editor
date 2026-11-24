// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../../src/ui/App';
import type { IImageExporter } from '../../../src/core/contracts';

// App은 모듈 단위 DiagramStore를 공유한다. 각 테스트는 '클래스 예제'를 열어 이력을 초기화한다.
const setup = async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await user.click(screen.getByRole('button', { name: '클래스 예제' }));
  const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Mermaid 코드' });
  const canvasNames = () => [...view.container.querySelectorAll('g.canvas-node')].map(n => n.textContent);
  return { user, source, canvasNames };
};

describe('App ↔ DiagramStore ↔ 어댑터 통합', () => {
  it('객체 추가 명령이 코드와 캔버스에 함께 반영되고 Undo로 되돌아간다 [SPEC-3.2][SPEC-5.3]', async () => {
    const { user, source, canvasNames } = await setup();
    const before = source.value;
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: '새 객체 이름' }), 'Invoice');
    await user.click(screen.getByRole('button', { name: '객체 추가' }));

    expect(source.value).toContain(before);
    expect(source.value).toMatch(/class Invoice/);
    expect(canvasNames().some(name => name?.includes('Invoice'))).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(source.value).toBe(before);
    expect(canvasNames().some(name => name?.includes('Invoice'))).toBe(false);
  });

  it('중복 객체 추가는 오류를 표시하고 코드를 바꾸지 않는다 [SPEC-3.2]', async () => {
    const { user, source } = await setup();
    const before = source.value;

    await user.type(screen.getByRole('textbox', { name: '새 객체 이름' }), 'User');
    await user.click(screen.getByRole('button', { name: '객체 추가' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(source.value).toBe(before);
  });

  it('잘못된 코드 입력 시 오류를 보이고 저장·추가를 막으며 마지막 정상 캔버스를 유지한다 [SPEC-1.2]', async () => {
    const { user, source, canvasNames } = await setup();
    const nodes = canvasNames();

    // 한 글자씩 입력하면 'classDiagram'까지 입력된 중간 상태가 마지막 정상 상태가 되므로 한 번에 붙여넣는다.
    source.focus();
    source.setSelectionRange(0, source.value.length);
    await user.paste('classDiagram\nthis is not mermaid');

    expect(screen.getByText(/\d/, { selector: '.feedback.error' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '파일 저장' })).toBeDisabled();
    expect(canvasNames()).toEqual(nodes);
  });
});

// jsdom에는 canvas·다운로드가 없으므로 IImageExporter 계약 경계에서 대체한다. 실제 이미지는 tests/system/export.spec.ts가 검증한다.
describe('이미지 내보내기 UI [SPEC-6.1]', () => {
  const setupExport = async (exporter: IImageExporter) => {
    const user = userEvent.setup();
    const download = vi.fn();
    // 저장 창 대신 produce()의 결과를 download로 받는다. 저장 창 순서는 download-blob.test.ts가 검증한다.
    const saveImage = vi.fn(async (filename: string, produce: () => Promise<Blob>) => download(await produce(), filename));
    render(<App exporter={exporter} saveImage={saveImage} />);
    await user.click(screen.getByRole('button', { name: '클래스 예제' }));
    const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Mermaid 코드' });
    return { user, download, source };
  };

  it.each([
    ['PNG', 'png', 'diagram.png'],
    ['JPG', 'jpeg', 'diagram.jpg'],
  ] as const)('대화상자에서 %s를 고르면 현재 문서를 그 형식으로 내보내고 %s 파일을 받는다', async (label, format, filename) => {
    const blob = new Blob(['image']);
    const exporter = { export: vi.fn<IImageExporter['export']>(async () => blob) };
    const { user, download, source } = await setupExport(exporter);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('radio', { name: label }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(exporter.export).toHaveBeenCalledTimes(1);
    const [document, requested] = exporter.export.mock.calls[0];
    expect(requested).toBe(format);
    expect(document.source).toBe(source.value);
    expect(download).toHaveBeenCalledWith(blob, filename);
    expect(screen.queryByRole('dialog', { name: '이미지 내보내기' })).not.toBeInTheDocument();
  });

  it.each([
    ['객체가 0개', 'classDiagram'],
    ['코드 오류', 'classDiagram\nthis is not mermaid'],
  ])('%s이면 내보내기 버튼이 비활성이다', async (_, code) => {
    const exporter = { export: vi.fn(async () => new Blob()) };
    const { user, source } = await setupExport(exporter);
    expect(screen.getByRole('button', { name: '내보내기' })).toBeEnabled();

    source.focus();
    source.setSelectionRange(0, source.value.length);
    await user.paste(code);

    expect(screen.getByRole('button', { name: '내보내기' })).toBeDisabled();
    expect(exporter.export).not.toHaveBeenCalled();
  });

  it('내보내기에 실패하면 오류를 표시하고 다운로드하지 않으며 코드와 이력을 바꾸지 않는다', async () => {
    const exporter = { export: vi.fn(async () => { throw new Error('canvas 실패'); }) };
    const { user, download, source } = await setupExport(exporter);
    const before = source.value;
    const undoEnabled = !(screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled;

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미지를 내보내지 못했습니다: canvas 실패');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Error:');
    expect(download).not.toHaveBeenCalled();
    expect(source.value).toBe(before);
    expect(!(screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(undoEnabled);
    expect(screen.getByRole('dialog', { name: '이미지 내보내기' })).toBeInTheDocument();
  });

  it('모달은 형식 선택에 포커스를 두고, Esc와 배경 클릭으로 닫히며 대화상자 안 클릭으로는 닫히지 않는다', async () => {
    const exporter = { export: vi.fn(async () => new Blob()) };
    const { user } = await setupExport(exporter);
    const open = async () => {
      await user.click(screen.getByRole('button', { name: '내보내기' }));
      return screen.getByRole('dialog', { name: '이미지 내보내기' });
    };

    const dialog = await open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('radio', { name: 'PNG' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(await open());
    expect(screen.getByRole('dialog', { name: '이미지 내보내기' })).toBeInTheDocument();
    await user.click(screen.getByRole('dialog').parentElement!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(exporter.export).not.toHaveBeenCalled();
  });

  it('취소하면 늦게 끝난 내보내기 결과를 다운로드하지 않는다', async () => {
    let finish!: (blob: Blob) => void;
    const exporter = { export: vi.fn(() => new Promise<Blob>(resolve => { finish = resolve; })) };
    const { user, download } = await setupExport(exporter);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));
    expect(screen.getByRole('button', { name: '내보내는 중…' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '취소' }));
    finish(new Blob(['late']));
    await Promise.resolve();

    expect(download).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: '이미지 내보내기' })).not.toBeInTheDocument();
  });
});

describe('이미지 저장 위치 선택 [SPEC-6.1]', () => {
  it('저장 창을 닫으면 이미지를 만들지 않고 오류 없이 대화상자를 열어 둔다', async () => {
    const user = userEvent.setup();
    const exporter = { export: vi.fn(async () => new Blob(['image'])) };
    const saveImage = vi.fn(async () => { throw new DOMException('사용자가 저장 창을 닫음', 'AbortError'); });
    render(<App exporter={exporter} saveImage={saveImage} />);
    await user.click(screen.getByRole('button', { name: '클래스 예제' }));

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(saveImage).toHaveBeenCalledWith('diagram.png', expect.any(Function));
    expect(exporter.export).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: '이미지 내보내기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이미지 저장' })).toBeEnabled();
  });
});

// 파일 입출력은 IFileManager 경계에서 대체한다. 실제 저장 창·다운로드는 local-file-manager.test.ts와 시스템 테스트가 검증한다.
const CODE = 'classDiagram\n  class Invoice';
const setupFiles = async (files: Partial<{ read: (file: Blob) => Promise<string>; write: (source: string) => Promise<void> }> = {}) => {
  const user = userEvent.setup();
  const manager = {
    read: vi.fn(files.read ?? (async (file: Blob) => file.text())),
    write: vi.fn(files.write ?? (async () => {})),
    reset: vi.fn(),
  };
  const view = render(<App files={manager} exporter={{ export: vi.fn(async () => new Blob()) }} />);
  await user.click(screen.getByRole('button', { name: '클래스 예제' }));
  manager.reset.mockClear();
  const source = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Mermaid 코드' });
  const paste = async (code: string) => {
    source.focus();
    source.setSelectionRange(0, source.value.length);
    await user.paste(code);
  };
  const fileInput = view.container.querySelector<HTMLInputElement>('input[type=file]')!;
  const unsaved = () => screen.queryByText(/저장 안 됨/);
  return { user, manager, source, paste, fileInput, unsaved };
};
// 단축키를 보내고, 앱이 브라우저 기본 동작을 막았는지 돌려준다.
const press = (target: Element, init: KeyboardEventInit) => !fireEvent.keyDown(target, init);

describe('파일 저장 [SPEC-5.1]', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([
    ['Ctrl+S', { key: 's', ctrlKey: true }],
    ['Cmd+S', { key: 's', metaKey: true }],
  ])('%s를 누르면 브라우저 기본 저장을 막고 코드와 배치를 저장하며 "저장 안 됨" 표시가 사라진다', async (_, keys) => {
    const { manager, source, paste, unsaved } = await setupFiles();
    await paste(CODE);
    expect(unsaved()).toBeInTheDocument();

    expect(press(source, keys)).toBe(true);

    await waitFor(() => expect(unsaved()).not.toBeInTheDocument());
    expect(manager.write).toHaveBeenCalledTimes(1);
    expect(manager.write.mock.calls[0][0]).toMatch(/^classDiagram\n {2}class Invoice\n%% @se-uml-layout /);
  });

  it('코드 오류가 있으면 Ctrl+S로 저장하지 않고 이유를 알린다', async () => {
    const { manager, source, paste } = await setupFiles();
    await paste('classDiagram\nthis is not mermaid');

    expect(press(source, { key: 's', ctrlKey: true })).toBe(true);

    expect(await screen.findByRole('alert')).toHaveTextContent('코드 오류를 수정한 뒤 저장하세요.');
    expect(manager.write).not.toHaveBeenCalled();

    await paste(CODE);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('저장 중에 다시 누른 Ctrl+S와 키 반복 입력은 무시하고, 저장이 끝나면 다시 저장할 수 있다', async () => {
    let finish!: () => void;
    const { manager, source, paste } = await setupFiles({ write: () => new Promise<void>(resolve => { finish = resolve; }) });
    await paste(CODE);

    press(source, { key: 's', ctrlKey: true });
    expect(press(source, { key: 's', ctrlKey: true })).toBe(true);
    expect(press(source, { key: 's', ctrlKey: true, repeat: true })).toBe(true);
    expect(manager.write).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    finish();
    await waitFor(() => expect(screen.queryByText(/저장 안 됨/)).not.toBeInTheDocument());
    press(source, { key: 's', ctrlKey: true });
    expect(manager.write).toHaveBeenCalledTimes(2);
  });

  it('저장하는 사이 다른 문서를 열면, 끝난 저장이 새 문서를 저장된 것으로 기록하지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish!: () => void;
    const { user, source, paste, unsaved } = await setupFiles({ write: () => new Promise<void>(resolve => { finish = resolve; }) });
    await paste(CODE);
    press(source, { key: 's', ctrlKey: true });

    await user.click(screen.getByRole('button', { name: '시퀀스 예제' }));
    await act(async () => { finish(); });

    expect(source.value).toMatch(/^sequenceDiagram/);
    expect(unsaved()).not.toBeInTheDocument();
  });

  it('저장 창을 닫으면 오류를 표시하지 않고 "저장 안 됨" 상태를 유지한다', async () => {
    const { user, manager, paste, unsaved } = await setupFiles({
      write: async () => { throw new DOMException('사용자가 저장 창을 닫음', 'AbortError'); },
    });
    await paste(CODE);

    await user.click(screen.getByRole('button', { name: '파일 저장' }));

    expect(manager.write).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(unsaved()).toBeInTheDocument();
  });

  it('쓰기에 실패하면 오류를 표시하고 "저장 안 됨" 상태를 유지한다', async () => {
    const { user, paste, unsaved } = await setupFiles({ write: async () => { throw new Error('디스크 가득 참'); } });
    await paste(CODE);

    await user.click(screen.getByRole('button', { name: '파일 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('파일을 저장하지 못했습니다: 디스크 가득 참');
    expect(unsaved()).toBeInTheDocument();
  });

  it('저장하지 않은 변경이 있을 때만 페이지를 닫으려 하면 경고한다 (현재 동작 고정)', async () => {
    const { user, paste } = await setupFiles();
    const closePage = () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(closePage()).toBe(false);

    await paste(CODE);
    expect(closePage()).toBe(true);

    await user.click(screen.getByRole('button', { name: '파일 저장' }));
    await waitFor(() => expect(closePage()).toBe(false));
  });
});

describe('파일 열기 [SPEC-5.2]', () => {
  afterEach(() => { vi.restoreAllMocks(); });
  const file = (text: string) => new File([text], 'saved.mmd', { type: 'text/plain' });

  it('저장하지 않은 변경이 없으면 확인 없이 파일을 열고, 기억해 둔 저장 위치를 잊는다', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    const { user, manager, source, fileInput, unsaved } = await setupFiles();

    await user.upload(fileInput, file(CODE));

    await waitFor(() => expect(source.value).toBe(CODE));
    expect(confirm).not.toHaveBeenCalled();
    expect(manager.reset).toHaveBeenCalledTimes(1);
    expect(unsaved()).not.toBeInTheDocument();
  });

  it('저장하지 않은 변경이 있을 때 확인을 취소하면 파일을 읽지 않고 현재 작업을 유지한다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, manager, source, paste, fileInput } = await setupFiles();
    await paste(CODE);

    await user.upload(fileInput, file('sequenceDiagram\n  participant A'));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(manager.read).not.toHaveBeenCalled();
    expect(manager.reset).not.toHaveBeenCalled();
    expect(source.value).toBe(CODE);
  });

  it('저장하지 않은 변경이 있을 때 확인하면 파일을 연다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, source, paste, fileInput } = await setupFiles();
    await paste(CODE);

    await user.upload(fileInput, file('sequenceDiagram\n  participant A'));

    await waitFor(() => expect(source.value).toBe('sequenceDiagram\n  participant A'));
  });

  it('예제를 열 때도 저장하지 않은 변경이 있으면 확인하고, 취소하면 현재 작업을 유지한다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user, source, paste } = await setupFiles();
    await paste(CODE);

    await user.click(screen.getByRole('button', { name: '시퀀스 예제' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(source.value).toBe(CODE);
  });

  it('손상되거나 형식이 다른 파일은 "열 수 없는 파일이에요"와 행 번호를 보여 주고 현재 문서를 유지한다', async () => {
    const { user, manager, source, fileInput } = await setupFiles();
    const before = source.value;

    await user.upload(fileInput, file('\u0089PNG\r\n\u001a\n'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^열 수 없는 파일이에요\. 1행: /);
    expect(source.value).toBe(before);
    expect(manager.reset).not.toHaveBeenCalled();
  });

  it('파일을 읽지 못하면 "열 수 없는 파일이에요"를 보여 주고 현재 문서를 유지한다', async () => {
    const { user, source, fileInput } = await setupFiles({ read: async () => { throw new Error('권한 없음'); } });
    const before = source.value;

    await user.upload(fileInput, file(CODE));

    expect(await screen.findByRole('alert')).toHaveTextContent('열 수 없는 파일이에요. 권한 없음');
    expect(source.value).toBe(before);
  });
});

describe('실행취소 단축키 [SPEC-5.3]', () => {
  it('코드 영역에서 Ctrl+Z는 Store 실행취소, Ctrl+Shift+Z와 Ctrl+Y는 다시실행이며 브라우저 기본 동작을 막는다', async () => {
    const { source, paste } = await setupFiles();
    const before = source.value;
    await paste(CODE);

    expect(press(source, { key: 'z', ctrlKey: true })).toBe(true);
    expect(source.value).toBe(before);
    expect(press(source, { key: 'Z', ctrlKey: true, shiftKey: true })).toBe(true);
    expect(source.value).toBe(CODE);
    expect(press(source, { key: 'z', metaKey: true })).toBe(true);
    expect(source.value).toBe(before);
    expect(press(source, { key: 'y', ctrlKey: true })).toBe(true);
    expect(source.value).toBe(CODE);
  });

  it('한글 조합 중에 누른 Ctrl+Z는 실행취소하지 않는다', async () => {
    const { source, paste } = await setupFiles();
    await paste(CODE);
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'isComposing', { value: true }); // jsdom의 KeyboardEvent에는 isComposing이 없다.

    source.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(source.value).toBe(CODE);
  });

  it('새 객체 이름 입력칸이나 내보내기 대화상자에서 누른 Ctrl+Z는 문서를 되돌리지 않는다', async () => {
    const { user, source, paste } = await setupFiles();
    await paste(CODE);

    expect(press(screen.getByRole('textbox', { name: '새 객체 이름' }), { key: 'z', ctrlKey: true })).toBe(false);
    expect(source.value).toBe(CODE);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    expect(press(screen.getByRole('dialog'), { key: 'z', ctrlKey: true })).toBe(false);
    expect(source.value).toBe(CODE);
  });
});
