// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../../src/ui/App';

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
