// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileManager } from '../../../src/adapters/local-file-manager';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { GridLayout } from '../../../src/adapters/grid-layout';
import { DiagramStore } from '../../../src/core/diagram-store';
import { readLayoutMetadata } from '../../../src/core/layout-metadata';
import { readRoutes, routeKeys } from '../../../src/core/manual-routes';
import { sequenceRouteKeys } from '../../../src/core/diagram-geometry';
import { writeRoute } from '../../../src/core/route-editing';
import type { DiagramModel } from '../../../src/core/types';
import { fakeSavePicker } from './fake-save-picker';

// 편집한 Store → LocalFileManager로 저장 → 새 Store(앱을 다시 실행한 상태)에서 같은 파일을 연다.
const newStore = (source: string) => new DiagramStore(new BasicMermaidParser(), new GridLayout(), source);

async function saveAndReopen(store: DiagramStore) {
  const picker = fakeSavePicker();
  const files = new LocalFileManager();
  await files.write(store.getPersistedSource());
  expect(picker.written).toHaveLength(1);
  const saved = await files.read(picker.written[0]);
  const reopened = newStore('classDiagram');
  reopened.openSource(saved);
  return { saved, reopened };
}

const relationKey = (model: DiagramModel) => {
  if (model.kind !== 'class') throw new Error('클래스 다이어그램이 아닙니다.');
  return routeKeys(model.relations)[0];
};
const messageKey = (model: DiagramModel) => {
  if (model.kind !== 'sequence') throw new Error('시퀀스 다이어그램이 아닙니다.');
  return sequenceRouteKeys(model.steps)[0];
};

describe('작업 파일 저장 → 다시 열기 [SPEC-5.1][SPEC-5.2]', () => {
  afterEach(() => { window.showSaveFilePicker = undefined; });

  it('[IT-05] 좌표·크기·색상·꺾임점을 바꾼 문서를 저장하면 한 파일에 모두 담기고, 다시 실행해 열면 그대로 복원된다 [SPEC-3.2]', async () => {
    const code = 'classDiagram\n  class Order\n  class Customer\n  Order --> Customer : places';
    const store = newStore(code);
    store.moveNode('class:Order', 300, 200);
    store.resizeNode('class:Order', 260, 140);
    store.setNodeColor('class:Order', '#dff2e5');
    const key = relationKey(store.getSnapshot().model);
    const bends = [{ x: 520, y: 380 }, { x: 640, y: 380 }];
    store.updateSource(writeRoute(store.getSnapshot().source, key, bends));
    expect(store.getSnapshot().error).toBeNull();

    const { saved, reopened } = await saveAndReopen(store);

    // 파일 하나에 원문 코드, 배치(좌표·크기·색상), 꺾임점이 모두 있다.
    const { code: savedCode, layout } = readLayoutMetadata(saved);
    expect(savedCode.startsWith(code)).toBe(true);
    expect(layout?.['class:Order']).toMatchObject({ x: 300, y: 200, width: 260, height: 140, color: '#dff2e5' });
    expect(readRoutes(saved).get(key)).toEqual(bends);
    // 다시 연 문서가 같은 모델·배치·꺾임점을 가진다.
    const restored = reopened.getSnapshot();
    expect(restored.error).toBeNull();
    expect(restored.model).toEqual(store.getSnapshot().model);
    expect(restored.layout).toEqual(store.getSnapshot().layout);
    expect(readRoutes(restored.source).get(key)).toEqual(bends);
  });

  it('[IT-08] 객체가 0개인 문서도 저장되고, 다시 열면 같은 원문이다 (현재 동작 고정) [SPEC-9.2]', async () => {
    const store = newStore('sequenceDiagram');
    expect(store.getSnapshot().layout).toEqual({});

    const { saved, reopened } = await saveAndReopen(store);

    expect(readLayoutMetadata(saved)).toEqual({ code: 'sequenceDiagram', layout: {} });
    expect(reopened.getSnapshot().model).toEqual({ kind: 'sequence', participants: [], steps: [] });
    expect(readLayoutMetadata(reopened.getSnapshot().source).code).toBe('sequenceDiagram');
  });

  it('[IT-09] critical·option 블록과 메시지 꺾임점이 저장 후 다시 열어도 그대로다 [SPEC-1.3][SPEC-2.3]', async () => {
    const code = [
      'sequenceDiagram',
      '  participant A',
      '  participant B',
      '  critical 결제 승인',
      '    A->>B: 요청',
      '  option 시간 초과',
      '    B-->>A: 대기',
      '  option 권한 거부',
      '    B-->>A: 실패',
      '  end',
    ].join('\n');
    const store = newStore(code);
    const key = messageKey(store.getSnapshot().model);
    store.updateSource(writeRoute(store.getSnapshot().source, key, [{ x: 400, y: 260 }]));
    expect(store.getSnapshot().error).toBeNull();

    const { saved, reopened } = await saveAndReopen(store);

    expect(saved.startsWith(code)).toBe(true);
    const model = reopened.getSnapshot().model;
    expect(model).toEqual(store.getSnapshot().model);
    if (model.kind !== 'sequence') throw new Error('시퀀스 다이어그램이 아닙니다.');
    const [block] = model.steps;
    if (block.kind !== 'block') throw new Error('critical 블록이 아닙니다.');
    expect(block.operator).toBe('critical');
    expect(block.branches.map(branch => branch.label)).toEqual(['결제 승인', '시간 초과', '권한 거부']);
    expect(readRoutes(reopened.getSnapshot().source).get(key)).toEqual([{ x: 400, y: 260 }]);
  });
});
