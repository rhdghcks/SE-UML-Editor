import { useState, useEffect, useRef } from 'react';

import { MermaidPreview } from './MermaidPreview';
import { DiagramCanvas } from './DiagramCanvas';
import type { EditorSnapshot } from '../../core/types';

import './style-CanvasPanel.css';

interface CanvasPanelProps {
  // 캔버스 데이터
  snapshot: EditorSnapshot;
  // 에러 메시지
  error: string | null;

  // 내부에서 노드 이동시 실행할 함수
  onMove(id: string, x: number, y: number): void;
  // 내부에서 색상 변경시 실행할 함수
  onChangeColor(id: string, color: string): void;
}

//다이어그램 색상 선택지
const COLORS = ['#000000', '#ffffff', '#e8eefb', '#dff2e5', '#fff0ce', '#f9dfdf', '#e9ddf7'];

export function CanvasPanel({ snapshot, error, onMove, onChangeColor }: CanvasPanelProps) {

  // 선택 노드 색상 변경을 위한 기능
  const [selected, setSelected] = useState<string | null>(null);
  const currentNode = selected ? snapshot.layout[selected] : undefined;

  const previousKind = useRef(snapshot.model.kind);
  useEffect(() => {
    if (
      snapshot.origin === 'undo'
      || snapshot.origin === 'redo'
      || snapshot.origin === 'file'
      || snapshot.model.kind !== previousKind.current
    ) {
      setSelected(null);
    }

    previousKind.current = snapshot.model.kind;
  }, [snapshot]);

  // 현재 다이어그램 UI 모드 
  const [uiMode, setStandard] = useState(false);

  return (
    <section className="canvas-panel">
      {/* 제목 텍스트 */}
      <div className="panel-heading">
        <div className="panel-heading-text">캔버스 (개발용 미리보기)</div>

        {/* 캔버스 변형 버튼 */}

        <button onClick={() => setStandard(!uiMode)}>{uiMode ? '편집 캔버스' : 'Mermaid 미리보기'}</button>

      </div>


      {/* 모드에 따라 다른 UI 로드 */}
      {
        uiMode ?
          <MermaidPreview document={snapshot} /> :
          <DiagramCanvas document={snapshot} disabled={Boolean(snapshot.error)} selected={selected} onSelect={setSelected} onMove={onMove} />
      }

      {/* 색상 선택 버튼 */}
      <div className="selection-bar">
        {selected && currentNode ? <>
          <span>선택: {selected}</span>
          <span>색상</span>
          {COLORS.map((color) => <button key={color} className="swatch"
            title={color} style={{ backgroundColor: color }} disabled={Boolean(error)}
            onClick={() => onChangeColor(selected, color)} />)}
        </> : <span>노드를 선택하면 색상을 바꿀 수 있습니다.</span>}
      </div>
    </section >
  );

}