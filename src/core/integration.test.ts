import { describe, it, expect } from 'vitest';
import { DiagramStore } from './diagram-store';
import { validateModel } from './validation';
import { readLayoutMetadata } from './layout-metadata';
import { BasicMermaidParser } from '../adapters/basic-mermaid-parser';
import { GridLayout } from '../adapters/grid-layout';

const parser = new BasicMermaidParser();
const sample = 'classDiagram\r\n%% 팀 메모\r\nclass A  \r\n';
const create = () => new DiagramStore(parser, new GridLayout(), sample);

describe('공통 모듈 경계', () => {
  it('원문과 수동 좌표를 독립적으로 복구한다', () => {
    const store = create();
    store.moveNode('class:A', 87, 44);
    const saved = store.getPersistedSource();
    expect(readLayoutMetadata(saved).code).toBe(sample);
    store.openSource(saved);
    expect(store.getSnapshot().layout['class:A'].placement).toBe('manual');
    store.openSource(sample);
    expect(store.getSnapshot().layout['class:A'].placement).toBe('auto');
    expect(store.canUndo()).toBe(false);
  });
  it('GUI에서 추가한 선언이 코드와 캔버스에 함께 반영된다', () => {
    const store = create();
    store.moveNode('class:A', 200, 300);
    store.addNode('Invoice');
    const state = store.getSnapshot();
    expect(state.origin).toBe('gui');
    expect(state.source).toContain(sample);
    expect(state.model).toEqual(parser.parse(readLayoutMetadata(state.source).code));
    expect(state.layout['class:A'].x).toBe(200);
    expect(state.layout['class:Invoice'].placement).toBe('auto');
    expect(() => store.addNode('Invoice')).toThrow();
    expect(store.getSnapshot()).toBe(state);
  });
  it('스냅샷과 하위 배열은 외부에서 변경할 수 없다', () => {
    const state = create().getSnapshot();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.layout['class:A'])).toBe(true);
    const model = state.model;
    if (model.kind !== 'class') throw new Error('클래스 예제가 필요합니다.');
    expect(() => model.nodes.pop()).toThrow();
  });
  it('GUI 결과를 코드 입력으로 되돌려도 이벤트가 추가되지 않는다', () => {
    const store = create();
    const events: string[] = [];
    store.subscribe(() => {
      events.push(store.getSnapshot().origin);
      store.updateSource(store.getSnapshot().source);
    });
    store.moveNode('class:A', 20, 30);
    store.undo();
    store.redo();
    expect(events).toEqual(['gui', 'undo', 'redo']);
  });
  it('잘못된 파일이나 좌표는 현재 문서를 변경하지 않는다', () => {
    const store = create();
    const before = store.getSnapshot();
    expect(() => store.openSource('pie')).toThrow();
    expect(() => store.moveNode('class:A', Infinity, 0)).toThrow();
    expect(store.getSnapshot()).toBe(before);
  });
  it('클래스 관계와 중첩 단계의 ID 및 참조를 검증한다', () => {
    const model = parser.parse('classDiagram\nA --> B');
    if (model.kind !== 'class') throw new Error();
    model.nodes.push(model.nodes[0]);
    expect(() => validateModel(model)).toThrow(/중복/);
    model.nodes.pop();
    model.relations[0].to = 'class:Missing';
    expect(() => validateModel(model)).toThrow(/참조/);
    const seq = parser.parse('sequenceDiagram\nloop retry\nactivate A\nend');
    if (seq.kind !== 'sequence') throw new Error();
    seq.participants = [];
    expect(() => validateModel(seq)).toThrow(/참조/);
  });
  it('정확히 30개 참여자를 허용하고 다음 추가를 거부한다', () => {
    const store = create();
    const source = 'sequenceDiagram\n' + Array.from({ length: 30 }, (_, i) => 'participant P' + i).join('\n');
    store.updateSource(source);
    expect(store.getSnapshot().error).toBeNull();
    store.updateSource(source + '\nparticipant Extra');
    expect(store.getSnapshot().error).toContain('30');
  });
  it('초기화 지시문을 지원하지 않으면 원문을 오류 상태로 보관한다', () => {
    const store = create();
    const source = "%%{init: {}}%%\nclassDiagram";
    store.updateSource(source);
    expect(store.getSnapshot().source).toBe(source);
    expect(store.getSnapshot().error).toBeTruthy();
  });
});
