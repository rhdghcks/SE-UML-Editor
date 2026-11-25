//구현 필요 기능
//drawClass : g로 묶인 하나의 클래스를 그려냄
//drawRelation : 클래스 간의 관계선을 그려냄
//drawPoint : 관계선의 꺾임점을 그려냄, 아마 마우스를 올리고 있을때만 보임

import { Canvas } from './Canvas';
import type { DiagramDocument } from '../../../core/types';

interface Props {
  canvas: Canvas;
  document: DiagramDocument;
  disabled: boolean;
  selected: string | null;
  onSelect(id: string): void;
  onMove(id: string, x: number, y: number): void;
}


function drawClassDiagram({ canvas, document, disabled, selected, onSelect, onMove }: Props) {

}
