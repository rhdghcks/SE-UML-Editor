import { useRef, useState, useSyncExternalStore } from 'react';
import { GridLayout } from '../adapters/grid-layout';
import { BasicMermaidParser } from '../adapters/basic-mermaid-parser';
import { DiagramStore } from '../core/diagram-store';
import { LocalFileManager } from '../adapters/local-file-manager';

import { CodeEditorPanel } from './codeEditor/CodeEditorPanel';
import { CanvasPanel } from './diagram/CanvasPanel';

// 예제 데이터 2종
const CLASS_EXAMPLE = `
classDiagram
  class User {
    +name: string
    +login()
  }
  class Session
  User --> Session : creates
  Session -- s1
  s1 -- s2
  s2 -- s3
  s3 -- s4
  s4 -- s5
  s5 -- s6
  `;

const SEQUENCE_EXAMPLE = `
  sequenceDiagram
  participant User
  participant Server
  User->>Server: login()
  activate Server
  Server-->>User: token
  deactivate Server
  alt valid token
    User->>Server: getProfile()
  else expired
    Server-->>User: unauthorized
  end
  `;

const store = new DiagramStore(new BasicMermaidParser(), new GridLayout(), SEQUENCE_EXAMPLE);

const files = new LocalFileManager();

export function App() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [nodeName, setNodeName] = useState('');
  const [fileError, setFileError] = useState('');
  const request = useRef(0);

  const openFile = async (file: File | undefined) => {
    if (!file) return;
    const ticket = ++request.current;
    const revision = store.getSnapshot().revision;
    try {
      const source = await files.read(file);
      if (ticket !== request.current || revision !== store.getSnapshot().revision) return;
      store.openSource(source);
      setFileError('');
    } catch (error) { if (ticket === request.current) setFileError(String(error)); }
  };

  return <main className="app">
    {/* 맨 위 UI */}
    <header className="app-header">
      <div>
        <h1>SE-UML Editor</h1>
        <p>공통 모델과 편집 흐름을 확인하는 개발용 화면</p>
      </div>

      {/* 예제 불러오기 */}
      <div className="actions">
        <button onClick={() => { store.openSource(CLASS_EXAMPLE); }}>클래스 예제</button>
        <button onClick={() => { store.openSource(SEQUENCE_EXAMPLE); }}>시퀀스 예제</button>
        <button disabled={!store.canUndo()} onClick={store.undo}>Undo</button>
        <button disabled={!store.canRedo()} onClick={store.redo}>Redo</button>
      </div>
    </header>

    {/* 툴바 UI */}
    <div className="toolbar">

      {/* 파일 불러오기 기능 UI */}
      <label className="file-input">.mmd 열기<input type="file" accept=".mmd,.txt,text/plain"
        onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ''; }} /></label>

      {/* 불러온 파일 에러 표시 */}
      {fileError && <span role="alert">{fileError}</span>}

      {/* 파일 저장 버튼, 텍스트 오류시 비활성화 */}
      <button disabled={Boolean(snapshot.error)} onClick={() => void files.write(store.getPersistedSource()).catch(error => setFileError(String(error)))}>파일 저장</button>

      {/* 객체 추가 UI */}
      <form onSubmit={event => {
        event.preventDefault();
        try {
          store.addNode(nodeName);
          setNodeName('');
          setFileError('');
        } catch (error) { setFileError(String(error)); }
      }}>
        <input aria-label="새 객체 이름" placeholder="새 객체 이름" value={nodeName}
          onChange={event => setNodeName(event.target.value)} />
        <button disabled={!nodeName || Boolean(snapshot.error)}>객체 추가</button>
      </form>

      <span>revision {snapshot.revision} · {snapshot.model.kind === 'class' ? 'Class' : 'Sequence'}</span>
    </div>

    {/* 작업 화면 */}
    <div className="workspace">

      {/* 코드 편집 영역 */}

      <CodeEditorPanel source={snapshot.source} error={snapshot.error} onChange={store.updateSource}
      />

      {/* 캔버스 영역 */}

      <CanvasPanel snapshot={snapshot} error={snapshot.error} onMove={store.moveNode} onChangeColor={store.setNodeColor} />


    </div>
    <footer>이 화면은 팀 통합용 샘플입니다. 완전한 Mermaid 렌더러나 최종 UI가 아닙니다.</footer>
  </main >;
}
