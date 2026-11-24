import { useState, useEffect, useRef } from 'react';

import { MermaidPreview } from './MermaidPreview';
import { New_DiagramCanvas } from './canvas/new_DiagramCanvas';
import type { EditorSnapshot } from '../../core/types';

import './style-DiagramPanel.css';

interface Props {
  // 캔버스 데이터
  snapshot: EditorSnapshot;
  //캔버스 조작 비활성화 여부
  disabled: boolean;

  // 내부에서 노드 이동시 실행할 함수
  onMove(id: string, x: number, y: number): void;
  // 내부에서 노드 색상 변경시 실행할 함수
  onChangeColor(id: string, color: string): void;
}


export function DiagramPanel({ snapshot, disabled, onMove, onChangeColor }: Props) {

  // 현재 다이어그램 UI 모드 
  const [uiMode, setStandard] = useState(false);

  return (
    <section className="canvas-panel">
      {/* 제목 텍스트 */}
      <div className="panel-heading">
        <div className="panel-heading-text">
          {snapshot.model.kind == 'class' ? '클래스 다이어그램' : '시퀸스 다이어그램'}
        </div>

        {/* 캔버스 모드 변경 버튼 */}
        <button onClick={() => setStandard(!uiMode)}>{uiMode ? '편집 캔버스' : 'Mermaid 미리보기'}</button>
      </div>

      {/* 모드에 따라 다른 UI 로드 */}
      <div>
        {uiMode ?
          <MermaidPreview document={snapshot} /> :
          <New_DiagramCanvas snapshot={snapshot} disabled={disabled} onMove={onMove} onChangeColor={onChangeColor} />
        }
      </div>

    </section>
  );

}