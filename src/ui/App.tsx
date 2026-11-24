import { arrangeClasses } from '../adapters/elk-layout';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { GridLayout } from '../adapters/grid-layout';
import { MermaidParser } from '../adapters/mermaid-parser';
import { BasicMermaidParser } from '../adapters/basic-mermaid-parser';
import { loadMermaidRuntime } from '../adapters/mermaid-runtime';
import { DiagramStore } from '../core/diagram-store';
import { useRef } from 'react';
import { MermaidPreview } from './MermaidPreview';
import { MermaidRenderer } from '../adapters/mermaid-renderer';
import { LocalFileManager } from '../adapters/local-file-manager';
import { DiagramCanvas } from './DiagramCanvas';
import { AlignmentSnap } from '../adapters/alignment-snap';
import { writeRoute } from '../core/route-editing';
import { canvasEdges } from '../core/diagram-geometry';

const CLASS_EXAMPLE = `classDiagram
  class User {
    +name: string
    +login()
  }
  class Session
  User --> Session : creates`;

const SEQUENCE_EXAMPLE = `sequenceDiagram
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
  end`;

const snap: AlignmentSnap = new AlignmentSnap(() => store.getSnapshot());
const store: DiagramStore = new DiagramStore(new MermaidParser(new BasicMermaidParser(), await loadMermaidRuntime()), new GridLayout(), SEQUENCE_EXAMPLE, snap, arrangeClasses);
const COLORS = ['#000000', '#ffffff', '#e8eefb', '#dff2e5', '#fff0ce', '#f9dfdf', '#e9ddf7'];

const files = new LocalFileManager();
const renderer = new MermaidRenderer();

export function App() {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const currentNode = selected ? snapshot.layout[selected] : undefined;

  const [nodeName, setNodeName] = useState('');
  const [standard, setStandard] = useState(false);
  const [fileError, setFileError] = useState('');
  const [snapEnabled, setSnapEnabled] = useState(true);
  function updateRoute(key: string, points: Array<{ x: number; y: number }>) {
    const current = store.getSnapshot();
    if (current.error) throw new Error('코드 오류를 수정한 뒤 편집하세요.');
    if (!canvasEdges(current).some(edge => edge.key === key)) throw new Error('없는 간선입니다.');
    store.updateSource(writeRoute(current.source, key, points));
    const error = store.getSnapshot().error;
    if (error) throw new Error(error);
  }
  const typing = useRef({ group: Symbol(), lastInput: -Infinity });
  function editCode(source: string) {
    const now = performance.now();
    if (now - typing.current.lastInput > 700) typing.current.group = Symbol();
    typing.current.lastInput = now;
    store.updateSource(source, typing.current.group);
  }
  useEffect(() => {
    function onHistoryKey(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing ||
          event.key.toLowerCase() !== 'z' || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      if (event.shiftKey) store.redo();
      else store.undo();
    }
    window.addEventListener('keydown', onHistoryKey);
    return () => window.removeEventListener('keydown', onHistoryKey);
  }, []);
  const request = useRef(0);
  const openFile = async (file: File | undefined) => {
    if (!file) return;
    const ticket = ++request.current;
    const revision = store.getSnapshot().revision;
    try {
      const source = await files.read(file);
      if (ticket !== request.current || revision !== store.getSnapshot().revision) return;
      store.openSource(source);
      setSelected(null);
      setFileError('');
    } catch (error) { if (ticket === request.current) setFileError(String(error)); }
  };

  return <main className="app">
    <header className="app-header">
      <div>
        <h1>SE-UML Editor</h1>
        <p>공통 모델과 편집 흐름을 확인하는 개발용 화면</p>
      </div>
      <div className="actions">
        <button onClick={() => { store.openSource(CLASS_EXAMPLE); setSelected(null); }}>클래스 예제</button>
        <button onClick={() => { store.openSource(SEQUENCE_EXAMPLE); setSelected(null); }}>시퀀스 예제</button>
        <button disabled={!store.canUndo()} onClick={store.undo}>Undo</button>
        <button disabled={!store.canRedo()} onClick={store.redo}>Redo</button>
      </div>
    </header>
    <div className="toolbar">
      <label className="file-input">.mmd 열기<input type="file" accept=".mmd,.txt,text/plain"
        onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button disabled={Boolean(snapshot.error)} onClick={() => void files.write(store.getPersistedSource()).catch(error => setFileError(String(error)))}>파일 저장</button>
      {fileError && <span role="alert">{fileError}</span>}
      <button onClick={() => setStandard(!standard)}>{standard ? '편집 캔버스' : 'Mermaid 미리보기'}</button>
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
      <label><input type="checkbox" checked={snapEnabled} onChange={event => {
        snap.enabled = event.target.checked; setSnapEnabled(event.target.checked);
      }} /> 노드·간선 스냅</label>
    </div>
    <div className="workspace">
      <section className="code-panel">
        <div className="panel-heading">Mermaid 코드</div>
        <textarea spellCheck="false" aria-label="Mermaid 코드"
          value={snapshot.source} onBlur={() => { typing.current.lastInput = -Infinity; }}
          onChange={(event) => editCode(event.target.value)} />
        <div className={snapshot.error ? 'feedback error' : 'feedback'}>
          {snapshot.error ?? '코드가 유효합니다. 캔버스에서 노드를 드래그해 보세요.'}
        </div>
      </section>
      <section className="canvas-panel">
        <div className="panel-heading">캔버스 (개발용 미리보기)</div>
        {standard ? <MermaidPreview document={snapshot} renderer={renderer} /> : <DiagramCanvas document={snapshot} disabled={Boolean(snapshot.error)}
          selected={selected} onSelect={setSelected} onMove={store.moveNode} onResize={store.resizeNode}
          onRouteChange={updateRoute} onError={setFileError}
          snapNode={(point, id) => snap.snap(point, id, store.getSnapshot().layout)} />}
        <div className="selection-bar">
          {selected && currentNode ? <>
            <span>선택: {selected}</span>
            <span>색상</span>
            {COLORS.map((color) => <button key={color} className="swatch"
              title={color} style={{ backgroundColor: color }} disabled={Boolean(snapshot.error)}
              onClick={() => store.setNodeColor(selected, color)} />)}
          </> : <span>노드를 선택하면 색상을 바꿀 수 있습니다.</span>}
        </div>
      </section>
    </div>
    <footer>이 화면은 팀 통합용 샘플입니다. 완전한 Mermaid 렌더러나 최종 UI가 아닙니다.</footer>
  </main>;
}
