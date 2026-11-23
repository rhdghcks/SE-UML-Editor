import type { ILayoutEngine } from '../core/contracts';
import { nodeIds } from '../core/types';
import type { DiagramModel, LayoutMap } from '../core/types';

export class GridLayout implements ILayoutEngine {
  layout(model: DiagramModel, previous: LayoutMap): LayoutMap {
    const result: LayoutMap = {};
    const ids = nodeIds(model);
    for (const id of ids) {
      if (Object.hasOwn(previous, id)) result[id] = { ...previous[id], placement: previous[id].placement ?? 'manual' };
    }
    let slot = 0;
    let nextLane = 60;
    for (const id of ids) {
      if (result[id]) {
        nextLane = Math.max(nextLane, result[id].x + result[id].width + 80);
        continue;
      }
      const sequence = model.kind === 'sequence';
      let x = sequence ? nextLane : 60 + (slot % 3) * 250;
      let y = 70 + (sequence ? 0 : Math.floor(slot / 3) * 190);
      const width = sequence ? 170 : 190;
      const height = sequence ? 70 : 112;
      // 기존 노드의 끝으로 건너뛰면 큰 수동 박스도 한 칸씩 탐색할 필요가 없다.
      for (const box of Object.values(result).sort((a, b) => sequence ? a.x - b.x : a.y - b.y)) {
        if (x < box.x + box.width && x + width > box.x && y < box.y + box.height && y + height > box.y) {
          if (sequence) x = box.x + box.width + 24;
          else y = box.y + box.height + 24;
        }
      }
      result[id] = { x, y, width, height, color: '#ffffff', placement: 'auto' };
      nextLane = x + width + 80;
      slot++;
    }
    return result;
  }
}
