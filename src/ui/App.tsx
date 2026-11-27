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
import { CanvasSvgRenderer } from '../adapters/canvas-svg-renderer';
import { SvgImageExporter, type ImageFormat } from '../adapters/svg-image-exporter';
import { isAbortError, saveBlob } from '../adapters/download-blob';
import type { IFileManager, IImageExporter } from '../core/contracts';
import { nodeIds } from '../core/types';
import { AlignmentSnap } from '../adapters/alignment-snap';
import { writeRoute, writeSequenceOffset } from '../core/route-editing';
import { canvasEdges } from '../core/diagram-geometry';
import { LayoutInteraction } from '../core/layout-interaction';

const CLASS_EXAMPLE = `classDiagram
  class User {
    +name: string
    +login()
  }
  User <|-- Session1
  User --|> Session2
  User *-- Session3
  User o-- Session4

  User2 --> Session5
  User2 -- Session6
  User2 ..> Session7
  User2 ..|> Session8`;

const SEQUENCE_EXAMPLE = `sequenceDiagram
participant User
participant Server

User->>Server: login()
activate Server
Server-->>User: token
deactivate Server

alt valid token
  User --> Server: getProfile()
else expired
  Server -> User: unauthorized
end
User -> User : ee
Server --> Server : ff`;

const snap: AlignmentSnap = new AlignmentSnap(() => store.getSnapshot());
const interaction = new LayoutInteraction();
const store: DiagramStore = new DiagramStore(new MermaidParser(new BasicMermaidParser(), await loadMermaidRuntime()), new GridLayout(), SEQUENCE_EXAMPLE, snap,
  (model, boxes, added) => interaction.complete(arrangeClasses(model, boxes, added)));

const defaultFiles = new LocalFileManager();
const renderer = new MermaidRenderer();
const defaultExporter = new SvgImageExporter(new CanvasSvgRenderer(), 2);
const EXPORT_FILE: Record<ImageFormat, string> = { png: 'diagram.png', jpeg: 'diagram.jpg' };
const DISCARD_MESSAGE = '저장하지 않은 변경이 있어요. 계속하면 지금 작업이 사라져요. 계속할까요?';
const SAVE_BLOCKED_MESSAGE = '코드 오류를 수정한 뒤 저장하세요.';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

interface AppProps {
  exporter?: IImageExporter;
  saveImage?: (filename: string, produce: () => Promise<Blob>) => Promise<void>;
  files?: IFileManager & { reset?(): void };
}

export function App({ exporter = defaultExporter, saveImage = saveBlob, files = defaultFiles }: AppProps = {}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const [nodeName, setNodeName] = useState('');
  const [standard, setStandard] = useState(false);
  const [fileError, setFileError] = useState('');
  const [savedSource, setSavedSource] = useState(() => store.getSnapshot().source);
  const dirty = snapshot.source !== savedSource;
  const [snapEnabled, setSnapEnabled] = useState(true);
  function updateRoute(key: string, points: Array<{ x: number; y: number }>, offsetY?: number) {
    const current = store.getSnapshot();
    if (current.error) throw new Error('코드 오류를 수정한 뒤 편집하세요.');
    if (!canvasEdges(current).some(edge => edge.key === key)) throw new Error('없는 간선입니다.');
    let source = writeRoute(current.source, key, points);
    if (offsetY !== undefined) source = writeSequenceOffset(source, key, offsetY);
    store.updateSource(source);
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

  const confirmDiscard = () => !dirty || window.confirm(DISCARD_MESSAGE);
  const documentGeneration = useRef(0);
  const opened = () => {
    documentGeneration.current++;
    files.reset?.();
    setSavedSource(store.getSnapshot().source);
  };
  const openExample = (source: string) => {
    if (!confirmDiscard()) return;
    store.openSource(source);
    opened();
  };

  const request = useRef(0);
  const openFile = async (file: File | undefined) => {
    if (!file || !confirmDiscard()) return;
    const ticket = ++request.current;
    const revision = store.getSnapshot().revision;
    try {
      const source = await files.read(file);
      if (ticket !== request.current || revision !== store.getSnapshot().revision) return;
      store.openSource(source);
      opened();
      setFileError('');
    } catch (error) {
      if (ticket === request.current) setFileError(`열 수 없는 파일이에요. ${message(error)}`);
    }
  };

  const [saveBlocked, setSaveBlocked] = useState(false);
  useEffect(() => { if (!snapshot.error) setSaveBlocked(false); }, [snapshot.error]);
  const saving = useRef(false);
  const saveFile = async () => {
    if (saving.current) return;
    const { source, error } = store.getSnapshot();
    if (error) {
      setSaveBlocked(true);
      return;
    }
    const generation = documentGeneration.current;
    saving.current = true;
    try {
      await files.write(store.getPersistedSource());
      if (generation !== documentGeneration.current) return;
      setSavedSource(source);
      setFileError('');
    } catch (failure) {
      if (!isAbortError(failure)) setFileError(`파일을 저장하지 못했습니다: ${message(failure)}`);
    } finally {
      saving.current = false;
    }
  };

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ImageFormat>('png');
  const [exporting, setExporting] = useState(false);
  const exportRequest = useRef(0);
  const canExport = !snapshot.error && nodeIds(snapshot.model).length > 0;
  const closeExport = () => {
    ++exportRequest.current; // 진행 중인 내보내기 결과는 버린다.
    setExporting(false);
    setExportOpen(false);
  };
  const exportImage = async () => {
    const ticket = ++exportRequest.current;
    const format = exportFormat;
    setExporting(true);
    try {
      await saveImage(EXPORT_FILE[format], async () => {
        const blob = await exporter.export(store.getSnapshot(), format);
        if (ticket !== exportRequest.current) throw new DOMException('내보내기를 취소했습니다.', 'AbortError');
        return blob;
      });
      if (ticket !== exportRequest.current) return;
      setExportOpen(false);
      setFileError('');
    } catch (error) {
      if (ticket === exportRequest.current && !isAbortError(error)) {
        setFileError(`이미지를 내보내지 못했습니다: ${message(error)}`);
      }
    } finally {
      if (ticket === exportRequest.current) setExporting(false);
    }
  };

  const shortcuts = useRef({ saveFile, exportOpen });
  shortcuts.current = { saveFile, exportOpen };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (!event.repeat) void shortcuts.current.saveFile();
        return;
      }
      if (shortcuts.current.exportOpen || event.target instanceof HTMLInputElement) return;
      const undo = key === 'z' && !event.shiftKey;
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      if (!undo && !redo) return;
      event.preventDefault();
      typing.current.lastInput = -Infinity;
      if (undo) store.undo();
      else store.redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true; // preventDefault를 무시하는 이전 브라우저용
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);


  const errorLine = snapshot.error ?
    Number(snapshot.error.match(/^(\d+)행:/)?.[1]) || null
    : null;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const syncScroll = () => {
    const textarea = textareaRef.current;

    if (!textarea || !lineNumbersRef.current) return;

    lineNumbersRef.current.style.transform =
      `translateY(${-textarea.scrollTop}px)`;
  };

  return <main className="app">
    <header className="app-header">
      <div>
        <h1>SE-UML Editor</h1>
        <p>공통 모델과 편집 흐름을 확인하는 개발용 화면</p>
      </div>
      <div className="actions">
        <button onClick={() => openExample(CLASS_EXAMPLE)}>클래스 예제</button>
        <button onClick={() => openExample(SEQUENCE_EXAMPLE)}>시퀀스 예제</button>
        <button disabled={!store.canUndo()} onClick={store.undo} title="Ctrl+Z">Undo</button>
        <button disabled={!store.canRedo()} onClick={store.redo} title="Ctrl+Shift+Z">Redo</button>
      </div>
    </header>
    <div className="toolbar">
      <label className="file-input">.mmd 열기<input type="file" accept=".mmd,.txt,text/plain"
        onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button disabled={Boolean(snapshot.error)} onClick={() => void saveFile()} title="Ctrl+S">파일 저장</button>
      <button disabled={!canExport} onClick={() => setExportOpen(true)}>내보내기</button>
      {exportOpen && <div className="modal-backdrop"
        onClick={event => { if (event.target === event.currentTarget) closeExport(); }}
        onKeyDown={event => { if (event.key === 'Escape') closeExport(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby="export-title" className="modal">
          <h2 id="export-title">이미지 내보내기</h2>
          <fieldset>
            <legend>이미지 형식</legend>
            {(['png', 'jpeg'] as const).map(format => <label key={format}>
              <input type="radio" name="export-format" value={format} autoFocus={exportFormat === format}
                checked={exportFormat === format} onChange={() => setExportFormat(format)} />
              {format === 'png' ? 'PNG' : 'JPG'}
            </label>)}
          </fieldset>
          <div className="modal-actions">
            <button onClick={closeExport}>취소</button>
            <button className="primary" disabled={!canExport || exporting} onClick={() => void exportImage()}>
              {exporting ? '내보내는 중…' : '이미지 저장'}
            </button>
          </div>
        </div>
      </div>}
      {(saveBlocked && snapshot.error) ? <span role="alert">{SAVE_BLOCKED_MESSAGE}</span>
        : fileError && <span role="alert">{fileError}</span>}
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
      <span>revision {snapshot.revision} · {snapshot.model.kind === 'class' ? 'Class' : 'Sequence'}{dirty ? ' · 저장 안 됨' : ''}</span>
      <label><input type="checkbox" checked={snapEnabled} onChange={event => {
        snap.enabled = event.target.checked; setSnapEnabled(event.target.checked);
      }} /> 노드·간선 스냅</label>
    </div>
    <div className="workspace">
      <section className="code-panel">
        <div className="panel-heading">Mermaid 코드</div>
        <div className="code-editor">
          <div className="line-numbers" aria-hidden="true">
            <div ref={lineNumbersRef}>
              {snapshot.source.split('\n').map((_, index) => (
                <div key={index} className={errorLine === index + 1 ? 'error-line' : ''}>
                  {index + 1}
                </div>
              ))}
            </div>
          </div>
          <textarea className="code-input-area"
            ref={textareaRef}
            spellCheck="false" aria-label="Mermaid 코드"
            value={snapshot.source} onBlur={() => { typing.current.lastInput = -Infinity; }}
            onChange={(event) => editCode(event.target.value)}
            onScroll={syncScroll} />
        </div>
        <div className={snapshot.error ? 'feedback error' : 'feedback'}>
          {snapshot.error ?? '코드가 유효합니다. 캔버스에서 노드를 드래그해 보세요.'}
        </div>
      </section>
      <section className="canvas-panel">
        <div className="panel-heading">캔버스 (개발용 미리보기)</div>
        {standard ? <MermaidPreview document={snapshot} renderer={renderer} /> : <DiagramCanvas document={snapshot} disabled={Boolean(snapshot.error)}
          onMove={store.moveNode} onResize={store.resizeNode}
          onRouteChange={updateRoute} onError={setFileError}
          onInteractionStart={() => interaction.begin()}
          snapNode={(point, id) => snap.snap(point, id, store.getSnapshot().layout)}
          onChangeNodeColor={store.setNodeColor} />}
      </section>
    </div>
    <footer>이 화면은 팀 통합용 샘플입니다. 완전한 Mermaid 렌더러나 최종 UI가 아닙니다.</footer>
  </main>;
}
