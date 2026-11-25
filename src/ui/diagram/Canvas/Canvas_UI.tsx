//canvas-UI 노드 색상 변경창과 노드 조작창을 로드

//selection-bar 선택 노드 이름과 색상 선택지 버튼
//canvas 노드 이동이 가능한 창


//구현 필요 기능
//findClass : 클릭한 그림이 어떤 객체인지 판별

import { useState, useEffect, useRef } from 'react';
import type { EditorSnapshot } from '../../../core/types';
import { Canvas } from './Canvas';

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

  //현재 모델 종류
  const modelKind = snapshot.model.kind;
  //직전 모델 종류 저장
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
  //그림판용 객체
  const svg = useRef<SVGSVGElement>(null);
  //그림판 그림 영역 객체
  const drawingLayer = useRef<SVGGElement>(null);

  //그림판 도구 함수 모음 객체
  const canvasRef = useRef<Canvas | null>(null);

  //svg 내의 g 객체가 생성되었을 때 Canvas 생성, g를 캔버스 객체의 그림판으로 설정
  useEffect(() => {
    if (!drawingLayer.current) return;
    canvasRef.current = new Canvas(drawingLayer.current);
    return () => {
      canvasRef.current = null;
    };
  }, []);

  //좌표계, 줌 기능
  const [centerX, setCenterX] = useState(0);
  const [centerY, setCenterY] = useState(0);

  const [zoomLevel, setZoomLevel] = useState(0);
  const zoomScale = 1.1;
  const baseSize = 200;
  const canvasSize = Math.round(baseSize / (zoomScale ** zoomLevel));


  // 드래그 시작 위치(html 상대 좌표)
  const dragStart = useRef({
    x: 0,
    y: 0,
    centerX: 0,
    centerY: 0
  });

  // 현재 드래그중인지 기록
  const [isDragging, setIsDragging] = useState(false);
  // 드래그 시작
  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    // SVG 바탕을 누른 경우에만 허용
    if (event.target !== event.currentTarget) return;

    setIsDragging(true);

    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      centerX,
      centerY
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  // 드래그 중
  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!isDragging) return;

    const element = svg.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();

    // 실제 화면 크기 대비 SVG 좌표 비율
    const scale = canvasSize / Math.min(rect.width, rect.height);

    // 마우스 이동량을 SVG 좌표로 변환
    const dx = (event.clientX - dragStart.current.x) * scale;
    const dy = (event.clientY - dragStart.current.y) * scale;

    setCenterX(dragStart.current.centerX - dx);
    setCenterY(dragStart.current.centerY - dy);
  }

  // 드래그 종료
  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    setIsDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  //줌 휠 기능을 이벤트로 등록
  useEffect(() => {
    const canvas = svg.current;
    if (!canvas) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();

      setZoomLevel(level =>
        level + (event.deltaY < 0 ? 1 : -1)
      );
    }

    canvas.addEventListener('wheel', handleWheel, {
      passive: false
    });

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, []);


  //다이어그램 유형에 따라 서로 다른 하위 객체에게 그림 생성 위임
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.clear();

    if (modelKind === 'class') {
      canvas.drawRect(0, 0, 10, 20, {
        fill: '#FF0000'
      });
    } else if (modelKind === 'sequence') {
      canvas.drawRect(0, 10, 20, 10, {
        fill: '#00FF00'
      });
    } else {
      // 알 수 없는 다이어그램
    }

    canvas.drawLine(-100, -100, 100, 100);
    canvas.drawLine(100, -100, -100, 100);

  }, [snapshot, modelKind]);


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

        <span>pos : {Math.round(centerX)} {Math.round(centerY)}</span>
        <span>size : {canvasSize}</span>

      </div>

      {/* 캔버스 */}
      <svg className="canvas" ref={svg}
        viewBox={`${centerX - canvasSize / 2} ${centerY - canvasSize / 2} ${canvasSize} ${canvasSize}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      ><g ref={drawingLayer} />
      </svg>

    </section >
  );
}