// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    render(<App exporter={exporter} download={download} />);
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/이미지를 내보내지 못했습니다.*canvas 실패/);
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
