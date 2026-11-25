//canvas-UI 노드 색상 변경창과 노드 조작창을 로드

//selection-bar 선택 노드 이름과 색상 선택지 버튼
//canvas 노드 이동이 가능한 창


import { useState, useEffect, useRef } from 'react';
import type { EditorSnapshot } from '../../../core/types';
import { ClassDiagram } from './old_ClassDiagram';

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

  /////
  const svg = useRef<SVGSVGElement>(null);
  const canvas = svg.current;

  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0);
  const zoomScale = 1.1;
  const baseSize = 200;
  const canvasSize = baseSize / (zoomScale ** zoomLevel);

  //받은 좌표를 중심점 좌표계로 변환해 리턴
  function toCenterRect(
    x: number,
    y: number,
    w: number,
    h: number) {
    return {
      x: x - w / 2,
      y: y - h / 2,
      w,
      h
    };
  }

  function zoom(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();

    setZoomLevel(level =>
      level + (event.deltaY < 0 ? 1 : -1)
    );
  }

  function drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    props = {}) {
    const pos = toCenterRect(x, y, w, h);

    return (
      <rect
        {...props}
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
      />
    )
  }

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

        <span>pos : {centerX} {centerY}</span>
        <span>size : {canvasSize}</span>
      </div>

      {/* 캔버스 */}
      <svg className="canvas" ref={svg}
        viewBox={`${centerX - canvasSize / 2} ${centerY - canvasSize / 2} ${canvasSize} ${canvasSize}`}
        onWheel={zoom}
      >
        {/* 내부 도형 그리기는 별도 클래스로 관리 */}
        <g>

          {drawRect(0, 0, 200, 100, {
            fill: "#FF0000",
          })}

          <line
            x1="0" y1="0"
            x2="150" y2="100"
            stroke="#000000"
            strokeWidth="2" />
        </g>

      </svg>

      {/*}
      <div className="canvas">
        {modelKind === 'class' ? (
          <ClassDiagram document={snapshot} disabled={disabled} selected={selected} onSelect={setSelected} onMove={onMove} />
        ) : modelKind === 'sequence' ? (
          <div>(IMSI)SEQUENCE</div>
        ) : (
          <div>(IMSI)UNKNOWN</div>
        )}
      </div>
*/}

    </section >
  );
}