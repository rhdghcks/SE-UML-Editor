//canvas-UI 노드 색상 변경창과 노드 조작창을 로드

//selection-bar 선택 노드 이름과 색상 선택지 버튼
//canvas 노드 이동이 가능한 창


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

export function Canvas_UI({ snapshot, disabled, onMove, onChangeColor }: Props) {

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


  const isNodeSelected = Boolean(selected && currentNode);

  return (
    <section className="canvas-UI">
      {/* 색상 선택 버튼 */}
      <div className="selection-bar">
        {/* 선택 노드가 있는 경우 선택지 표시, 없는 경우 문구로 대체 */}
        <span>선택 노드 : {isNodeSelected ? selected : '없음'} </span>
        <div>
          <span>색상 </span>
          {COLORS.map(
            (color) =>
              <button
                key={color}
                className="color-switch"
                title={color}
                style={{ backgroundColor: color }}
                disabled={!isNodeSelected || disabled}
                onClick={() => onChangeColor(selected!, color)}
              />
          )}
        </div>
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