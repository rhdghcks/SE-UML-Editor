import { useRef } from 'react';

import './style-CodeEditorPanel.css';

interface CodeEditorProps {
  // Mermaid 코드
  source: string;
  // 에러 메시지
  error: string | null;
  // 내부에서 텍스트 변경시 실행할 함수
  onChange: (source: string) => void;
}

export function CodeEditorPanel({ source, error, onChange }: CodeEditorProps) {

  // 에러 줄 번호 추출
  const errorLine = error
    ? Number(error.match(/^(\d+)행:/)?.[1]) || null
    : null;

  // 스크롤 동기화용
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const syncScroll = () => {
    const textarea = textareaRef.current;

    if (!textarea || !lineNumbersRef.current) return;

    lineNumbersRef.current.style.transform =
      `translateY(${-textarea.scrollTop}px)`;
  };

  return (
    <section className="code-panel">

      {/* 편집 패널 제목 */}
      <div className="panel-heading">
        <div className="panel-heading-text">Mermaid 코드</div>
      </div>

      {/* 코드 입력 영역 */}
      <div className="code-editor">
        {/* 코드 줄 표시 */}

        <div className="line-numbers" aria-hidden="true">
          <div ref={lineNumbersRef}>
            {source.split('\n').map((_, index) => (
              <div key={index} className={errorLine === index + 1 ? 'error-line' : ''}
              > {index + 1}
              </div>
            ))}
          </div>
        </div>

        {/* 코드 입력 및 수정 */}
        <textarea
          ref={textareaRef}
          spellCheck={false}
          aria-label="Mermaid 코드"
          value={source}
          onChange={(event) => onChange(event.target.value)}
          onScroll={syncScroll}
        />
      </div>

      {/* 오류 메시지 */}
      <div className={error ? 'feedback error' : 'feedback'}>
        {error ?? '코드가 유효합니다. 캔버스에서 노드를 드래그해 보세요.'}
      </div>

    </section>
  );
}
