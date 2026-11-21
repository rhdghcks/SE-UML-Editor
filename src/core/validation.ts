import { nodeIds } from './types';
import type { DiagramModel, SequenceStep, LayoutMap } from './types';
import { isNodeLayout } from './layout-metadata';

export function validateModel(model: DiagramModel): void {
  const nodes = new Set(nodeIds(model));
  if (nodeIds(model).length > 30) throw new Error('캔버스 객체는 최대 30개까지 지원합니다.');
  const seen = new Set<string>();
  function unique(id: string) {
    if (!id || seen.has(id)) throw new Error(`비어 있거나 중복된 ID: ${id}`);
    seen.add(id);
  }
  function reference(id: string) {
    if (!nodes.has(id)) throw new Error(`참조 대상이 없습니다: ${id}`);
  }
  nodeIds(model).forEach(unique);
  if (model.kind === 'class') {
    for (const edge of model.relations) {
      unique(edge.id);
      reference(edge.from);
      reference(edge.to);
    }
    return;
  }
  function visit(step: SequenceStep) {
    unique(step.id);
    if (step.kind === 'message') {
      reference(step.from);
      reference(step.to);
    } else if (step.kind === 'activation') {
      reference(step.target);
    } else {
      if (!step.branches.length || (step.operator !== 'alt' && step.branches.length !== 1)) {
        throw new Error('시퀀스 블록의 분기 수가 올바르지 않습니다.');
      }
      for (const branch of step.branches) branch.steps.forEach(visit);
    }
  }
  model.steps.forEach(visit);
}

export function validateLayout(model: DiagramModel, layout: LayoutMap) {
  const ids = nodeIds(model);
  if (Object.keys(layout).length !== ids.length || ids.some(id => !Object.hasOwn(layout, id) || !isNodeLayout(layout[id]))) {
    throw new Error('모델의 모든 노드에 유효한 배치가 하나씩 필요합니다.');
  }
}

export function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
