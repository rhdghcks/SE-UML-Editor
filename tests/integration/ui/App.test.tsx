// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../../src/ui/App';
import type { IImageExporter } from '../../../src/core/contracts';
import { LocalFileManager } from '../../../src/adapters/local-file-manager';

// 자동 배치(ELK)가 끝나는 시점을 테스트가 정한다. hold 중에 시작한 배치는 release()를 부를 때까지 결과를 내지 않는다.
const layoutGate = vi.hoisted(() => {
  const waiting: Array<() => void> = [];
  return { hold: false, waiting, release() { for (const resolve of waiting.splice(0)) resolve(); } };
});
vi.mock('../../../src/adapters/elk-layout', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../src/adapters/elk-layout')>();
  return {
    arrangeClasses: async (...args: Parameters<typeof actual.arrangeClasses>) => {
      if (layoutGate.hold) await new Promise<void>(resolve => { layoutGate.waiting.push(resolve); });
      return actual.arrangeClasses(...args);
    },
  };
});

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

  it('[IT-06] 잘못된 코드 입력 시 오류를 보이고 저장·추가를 막으며 마지막 정상 캔버스를 유지한다 [SPEC-1.2]', async () => {
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
  const setupExport = async (exporter: IImageExporter, toGrayscale?: (image: Blob) => Promise<Blob>) => {
    const user = userEvent.setup();
    const download = vi.fn();
    // 저장 창 대신 produce()의 결과를 download로 받는다. 저장 창 순서는 download-blob.test.ts가 검증한다.
    const saveImage = vi.fn(async (filename: string, produce: () => Promise<Blob>) => download(await produce(), filename));
    render(<App exporter={exporter} saveImage={saveImage} toGrayscale={toGrayscale} />);
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

  it('[IT-14] 객체가 0개에서 1개가 되면 내보내기 버튼이 켜지고, 그 1개를 내보낸다', async () => {
    const exporter = { export: vi.fn(async () => new Blob(['png'])) };
    const { user, download, source } = await setupExport(exporter);
    const paste = async (code: string) => {
      source.focus();
      source.setSelectionRange(0, source.value.length);
      await user.paste(code);
    };
    await paste('classDiagram');
    expect(screen.getByRole('button', { name: '내보내기' })).toBeDisabled();

    await paste('classDiagram\n  class Invoice');
    expect(screen.getByRole('button', { name: '내보내기' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    expect(exporter.export).toHaveBeenCalledWith(expect.objectContaining({
      layout: { 'class:Invoice': expect.any(Object) },
    }), 'png');
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

  it.each(['PNG', 'JPG'])('색상 기본값은 컬러이고, 흑백을 고르면 %s 결과를 흑백으로 바꿔 받는다', async (label) => {
    const exported = new Blob(['color']);
    const gray = new Blob(['gray']);
    const exporter = { export: vi.fn(async () => exported) };
    const toGrayscale = vi.fn(async () => gray);
    const { user, download } = await setupExport(exporter, toGrayscale);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    expect(screen.getByRole('radio', { name: '컬러' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(exported, 'diagram.png'));
    expect(toGrayscale).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('radio', { name: label }));
    await user.click(screen.getByRole('radio', { name: '흑백' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    await waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    expect(toGrayscale).toHaveBeenCalledWith(exported);
    expect(download).toHaveBeenLastCalledWith(gray, label === 'PNG' ? 'diagram.png' : 'diagram.jpg');
  });

  it('흑백 변환에 실패하면 오류를 표시하고 다운로드하지 않는다', async () => {
    const exporter = { export: vi.fn(async () => new Blob(['color'])) };
    const toGrayscale = vi.fn(async () => { throw new Error('흑백 실패'); });
    const { user, download } = await setupExport(exporter, toGrayscale);

    await user.click(screen.getByRole('button', { name: '내보내기' }));
    await user.click(screen.getByRole('radio', { name: '흑백' }));
    await user.click(screen.getByRole('button', { name: '이미지 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미지를 내보내지 못했습니다: 흑백 실패');
    expect(download).not.toHaveBeenCalled();
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
  afterEach(() => {
    vi.restoreAllMocks();
    layoutGate.hold = false;
    layoutGate.release();
  });
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

  it('[IT-10] 손상되거나 형식이 다른 파일은 "열 수 없는 파일이에요"와 행 번호를 보여 주고 현재 문서를 유지한다', async () => {
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
  it('[IT-10] 0바이트 파일은 "열 수 없는 파일이에요"를 보여 주고 현재 문서를 유지한다', async () => {
    const { user, manager, source, fileInput } = await setupFiles();
    const before = source.value;

    await user.upload(fileInput, file(''));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^열 수 없는 파일이에요\. 1행: 다이어그램 코드가 비어 있습니다/);
    expect(source.value).toBe(before);
    expect(manager.reset).not.toHaveBeenCalled();
  });

  it('[IT-11] Windows 메모장이 만든 UTF-8 BOM 파일도 정상으로 열고, 원문에 BOM을 남기지 않는다', async () => {
    const files = new LocalFileManager();
    const { user, source, fileInput } = await setupFiles({ read: blob => files.read(blob) });
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const body = new TextEncoder().encode('classDiagram\r\n  class Order {\r\n    +주문번호: string\r\n  }\r\n');

    await user.upload(fileInput, new File([bom, body], 'notepad.mmd', { type: 'text/plain' }));

    // textarea는 표시할 때 CRLF를 LF로 바꾼다(HTML 표준). 첫 글자가 BOM(U+FEFF)이 아니어야 한다.
    await waitFor(() => expect(source.value).toBe('classDiagram\n  class Order {\n    +주문번호: string\n  }\n'));
    expect(source.value.charCodeAt(0)).not.toBe(0xfeff);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('[IT-12] 파일을 읽는 사이 코드를 고치면, 늦게 읽힌 파일이 고친 내용을 덮지 않고 그 이유를 알린다', async () => {
    let finish!: (text: string) => void;
    const { manager, source, paste, fileInput } = await setupFiles({
      read: () => new Promise<string>(resolve => { finish = resolve; }),
    });
    fireEvent.change(fileInput, { target: { files: [file('ignored')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(1));

    await paste(CODE);
    await act(async () => { finish('sequenceDiagram\n  participant Late'); });

    expect(source.value).toBe(CODE);
    expect(manager.reset).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('파일을 불러오는 사이 문서가 바뀌어 파일을 열지 않았어요. 다시 열어 주세요.');
  });

  it('[IT-12] 파일을 읽는 사이 Undo로 되돌리면, 늦게 읽힌 파일이 되돌린 문서를 덮지 않는다', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish!: (text: string) => void;
    const { manager, source, paste, fileInput } = await setupFiles({
      read: () => new Promise<string>(resolve => { finish = resolve; }),
    });
    const before = source.value;
    await paste(CODE);
    fireEvent.change(fileInput, { target: { files: [file('ignored')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(1));

    press(source, { key: 'z', ctrlKey: true });
    await act(async () => { finish('sequenceDiagram\n  participant Late'); });

    expect(source.value).toBe(before);
    expect(manager.reset).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('파일을 불러오는 사이 문서가 바뀌어 파일을 열지 않았어요. 다시 열어 주세요.');
  });

  it.each([
    ['되돌릴 것이 없는 Ctrl+Z', async () => { press(screen.getByRole('textbox', { name: 'Mermaid 코드' }), { key: 'z', ctrlKey: true }); }],
    ['거부된 객체 추가(중복 이름)', async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByRole('textbox', { name: '새 객체 이름' }), 'User');
      await user.click(screen.getByRole('button', { name: '객체 추가' }));
      expect(screen.getByRole('alert')).toHaveTextContent('이미 사용 중인 이름입니다.');
    }],
  ])('[IT-12] 파일을 읽는 사이 문서를 바꾸지 않은 명령(%s)은 파일 열기를 막지 않는다 (회귀)', async (_, command) => {
    let finish!: (text: string) => void;
    const { user, manager, source, fileInput } = await setupFiles({
      read: () => new Promise<string>(resolve => { finish = resolve; }),
    });
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.change(fileInput, { target: { files: [file('ignored')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(1));

    await command(user);
    await act(async () => { finish('sequenceDiagram\n  participant Opened'); });

    expect(source.value).toBe('sequenceDiagram\n  participant Opened');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('[IT-12] 파일을 읽는 사이 자동 배치만 끝나면(사용자 편집 없음) 고른 파일을 연다 (회귀)', async () => {
    let finish!: (text: string) => void;
    layoutGate.hold = true;
    const { manager, source, fileInput } = await setupFiles({
      read: () => new Promise<string>(resolve => { finish = resolve; }),
    });
    await waitFor(() => expect(layoutGate.waiting.length).toBeGreaterThan(0));
    const revision = () => screen.getByText(/^revision \d+/).textContent;
    const before = revision();
    fireEvent.change(fileInput, { target: { files: [file('ignored')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(1));

    // 파일을 읽는 도중 클래스 예제의 자동 배치를 끝낸다. revision만 오른다.
    layoutGate.release();
    await waitFor(() => expect(revision()).not.toBe(before));
    await act(async () => { finish('sequenceDiagram\n  participant Opened'); });

    expect(source.value).toBe('sequenceDiagram\n  participant Opened');
    expect(manager.reset).toHaveBeenCalledTimes(1);
  });

  it('[IT-12] 배치 주석이 있는 문서에서 새 클래스를 입력한 직후 고른 파일도, 자동 배치가 주석을 다시 써도 연다 (회귀)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish!: (text: string) => void;
    let deferRead = false;
    const { user, manager, source, fileInput } = await setupFiles({
      read: blob => deferRead ? new Promise<string>(resolve => { finish = resolve; }) : blob.text(),
    });
    const layout = { version: 1, nodes: { 'class:A': { x: 60, y: 70, width: 190, height: 112, color: '#ffffff', placement: 'auto' } } };
    const saved = `classDiagram\n  class A\n%% @se-uml-layout ${JSON.stringify(layout)}`;
    await user.upload(fileInput, file(saved));
    await waitFor(() => expect(source.value).toBe(saved));
    deferRead = true;

    // 관계로 이어진 새 클래스를 입력하고, 자동 배치가 끝나기 전에 파일을 고른다.
    layoutGate.hold = true;
    fireEvent.change(source, { target: { value: saved.replace('class A', 'class A\n  A --> B') } });
    await waitFor(() => expect(layoutGate.waiting.length).toBeGreaterThan(0));
    const typed = source.value;
    fireEvent.change(fileInput, { target: { files: [file('ignored')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(2));
    // 파일을 읽는 도중 자동 배치를 끝낸다. ELK가 B를 옮기며 배치 주석을 다시 쓴다.
    layoutGate.release();
    await waitFor(() => expect(source.value).not.toBe(typed));
    await act(async () => { finish('sequenceDiagram\n  participant Opened'); });

    expect(source.value).toBe('sequenceDiagram\n  participant Opened');
  });

  it('[IT-12] 두 파일을 연달아 열면 먼저 고른 파일이 늦게 읽혀도 마지막에 고른 파일만 열린다', async () => {
    const pending: Array<(text: string) => void> = [];
    const { manager, source, fileInput } = await setupFiles({
      read: () => new Promise<string>(resolve => { pending.push(resolve); }),
    });
    fireEvent.change(fileInput, { target: { files: [file('first')] } });
    fireEvent.change(fileInput, { target: { files: [file('second')] } });
    await waitFor(() => expect(manager.read).toHaveBeenCalledTimes(2));

    await act(async () => { pending[1]('sequenceDiagram\n  participant Second'); });
    await act(async () => { pending[0]('sequenceDiagram\n  participant First'); });

    expect(source.value).toBe('sequenceDiagram\n  participant Second');
    expect(manager.reset).toHaveBeenCalledTimes(1);
  });

  it.each([
    [30, true],
    [31, false],
  ])('[IT-13] 객체 %i개 파일 열기: 30개까지만 열린다 [SPEC-9.2]', async (count, opens) => {
    const { user, source, fileInput } = await setupFiles();
    const before = source.value;
    const code = ['classDiagram', ...Array.from({ length: count }, (_, i) => `  class Node${i}`)].join('\n');

    await user.upload(fileInput, file(code));

    if (opens) {
      await waitFor(() => expect(source.value).toBe(code));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(/^열 수 없는 파일이에요\. .*최대 30개/);
      expect(source.value).toBe(before);
    }
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
