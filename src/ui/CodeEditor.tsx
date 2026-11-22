
interface CodeEditorProps {
  source: string;
  error: string | null;
  onChange: (source: string) => void;
}

export function CodeEditor({ source, error, onChange, }: CodeEditorProps) {

  // 에러 줄 번호 추출
  const errorLine = error
    ? Number(error.match(/^(\d+)행:/)?.[1]) || null
    : null;

  return (
    <section className="code-panel">

      {/* 편집 패널 제목 */}
      <div className="panel-heading"> Mermaid 코드 </div>

      {/* 코드 입력 영역 */}
      <div className="code-editor">
        {/* 코드 줄 표시 */}
        <div className="line-numbers" aria-hidden="true">
          {source.split('\n').map((_, index) => (
            <div key={index} className={errorLine === index + 1 ? 'error-line' : ''}
            > {index + 1}
            </div>
          ))}
        </div>

        {/* 코드 입력 및 수정 */}
        <textarea
          spellCheck={false}
          aria-label="Mermaid 코드"
          value={source}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      {/* 오류 메시지 */}
      <div className={error ? 'feedback error' : 'feedback'}>
        {error ?? '코드가 유효합니다. 캔버스에서 노드를 드래그해 보세요.'}
      </div>

    </section>
  );
}
