import { useState, useEffect, useRef } from 'react';
import type { EditorSnapshot } from '../../../core/types';
import { ClassDiagram } from './ClassDiagram';

interface Props {
  snapshot: EditorSnapshot;

  //캔버스 조작 비활성화 여부
  disabled: boolean;

  // 내부에서 노드 이동시 실행할 함수
  onMove(id: string, x: number, y: number): void;
  // 내부에서 색상 변경시 실행할 함수
  onChangeColor(id: string, color: string): void;
}

//다이어그램 색상 선택지
const COLORS = ['#000000', '#ffffff', '#e8eefb', '#dff2e5', '#fff0ce', '#f9dfdf', '#e9ddf7'];

export function New_DiagramCanvas({ snapshot, disabled, onMove, onChangeColor }: Props) {

  // 선택 노드 색상 변경을 위한 기능
  const [selected, setSelected] = useState<string | null>(null);
  const currentNode = selected ? snapshot.layout[selected] : undefined;

  const modelKind = snapshot.model.kind;
  const previousKind = useRef(snapshot.model.kind);

  //아래 작업시 노드 선택 해제
  //undo, redo, 새 파일 불러오기, 다이어그램 유형 변경
  useEffect(() => {
    if (
      snapshot.origin === 'undo'
      || snapshot.origin === 'redo'
      || snapshot.origin === 'file'
      || snapshot.model.kind !== previousKind.current
    ) {
      setSelected(null);
    }

    previousKind.current = modelKind;
  }, [snapshot]);

  return (
    <section className="diagram-canvas">
      {/* 색상 선택 버튼 */}
      <div className="selection-bar">
        {/* 선택 노드가 있는 경우 선택지 표시, 없는 경우 문구로 대체 */}
        {selected && currentNode ? <>
          <span>선택: {selected} </span>
          <span>색상</span>

          {COLORS.map((color) => <button key={color} className="swatch"
            title={color} style={{ backgroundColor: color }} disabled={disabled}
            onClick={() => onChangeColor(selected, color)} />)}
        </> : <span>노드를 선택하면 색상을 바꿀 수 있습니다.</span>}
      </div>

      <div className="canvas">
        {modelKind === 'class' ? (
          <ClassDiagram document={snapshot} disabled={disabled} selected={selected} onSelect={setSelected} onMove={onMove} />
        ) : modelKind === 'sequence' ? (
          <div>(IMSI)SEQUENCE</div>
        ) : (
          <div>(IMSI)UNKNOWN</div>
        )}
      </div>
    </section>
  );
}