import type { ClassDiagram, LayoutMap } from '../core/types';

export async function arrangeClasses(model: ClassDiagram, boxes: LayoutMap, added: string[]): Promise<LayoutMap> {
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const graph = await new ELK().layout({
    id: 'diagram',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70', 'elk.spacing.nodeNode': '40' },
    children: model.nodes.map(({ id }) => ({ id, width: boxes[id].width, height: boxes[id].height })),
    edges: model.relations.map(({ id, from, to }) => ({ id, sources: [from], targets: [to] })),
  });
  const pending = new Set(added);
  const occupied = Object.entries(boxes).filter(([id]) => !pending.has(id)).map(([, box]) => box);
  const result = { ...boxes };
  for (const node of graph.children ?? []) {
    if (!pending.has(node.id)) continue;
    const box = { ...boxes[node.id], x: 48 + (node.x ?? 0), y: 48 + (node.y ?? 0) };
    for (const other of occupied.slice().sort((a, b) => a.y - b.y)) {
      if (box.x < other.x + other.width + 16 && box.x + box.width + 16 > other.x &&
          box.y < other.y + other.height + 16 && box.y + box.height + 16 > other.y) {
        box.y = other.y + other.height + 24;
      }
    }
    result[node.id] = box;
    occupied.push(box);
  }
  return result;
}
