import { describe, expect, it } from 'vitest';
import { canvasEdges, sequenceLabelPosition, sequenceRouteKeys, sequenceRowPositions, sequenceRows } from '../../../src/core/diagram-geometry';
import type { DiagramDocument, LayoutMap, SequenceStep } from '../../../src/core/types';

const box = { x: 60, y: 70, width: 190, height: 70, color: '#ffffff' };
const layout: LayoutMap = {
  'participant:User': { ...box }, 'participant:Server': { ...box, x: 350 },
};

describe('시퀀스 설명의 참여자 기준 위치 [SPEC-1.3][SPEC-2.1]', () => {
  it('활성화·비활성화의 오른쪽 끝을 가장 왼쪽 생명선 바깥에 맞춘다', () => {
    const steps: SequenceStep[] = [
      { id: 'on', kind: 'activation', target: 'participant:Server', action: 'activate' },
      { id: 'off', kind: 'activation', target: 'participant:Server', action: 'deactivate' },
    ];
    const [on, off] = sequenceRows(steps);
    expect(sequenceLabelPosition(on, 1, layout)).toEqual({ x: 139, y: 265, textAnchor: 'end' });
    const reordered = { ...layout, 'participant:User': { ...box, x: 610 } };
    expect(sequenceLabelPosition(on, 1, reordered)).toEqual({ x: 429, y: 265, textAnchor: 'end' });
    const moved = { ...reordered, 'participant:Server': { ...box, x: 450, y: 90, width: 230 } };
    expect(sequenceLabelPosition(off, 3, moved)).toEqual({ x: 549, y: 415, textAnchor: 'end' });
    expect(layout['participant:Server']).toEqual({ ...box, x: 350 });
  });

  it('중첩 critical·option·alt도 다른 설명과 같은 왼쪽 열을 사용한다', () => {
    const steps: SequenceStep[] = [{ id: 'outer', kind: 'block', operator: 'critical', branches: [
      { label: 'main', steps: [{ id: 'inner', kind: 'block', operator: 'alt', branches: [
        { label: 'yes', steps: [{ id: 'm1', kind: 'message', from: 'participant:User', to: 'participant:Server', arrow: '->>', text: 'call' }] },
        { label: 'no', steps: [] },
      ] }] },
      { label: 'retry', steps: [{ id: 'a', kind: 'activation', target: 'participant:Server', action: 'activate' }] },
    ] }];
    const rows = sequenceRows(steps);
    const positions: LayoutMap = { ...layout, 'participant:Other': { ...box, x: 0 } };
    expect(rows[0].participants).toEqual(['participant:User', 'participant:Server']);
    expect(sequenceLabelPosition(rows[0], 0, positions)).toEqual({ x: 79, y: 200, textAnchor: 'end' });
    expect(sequenceLabelPosition(rows[1], 1, positions)).toEqual({ x: 79, y: 265, textAnchor: 'end' });
    positions['participant:User'] = { ...box, x: 610 };
    expect(sequenceLabelPosition(rows[0], 0, positions)?.x).toBe(79);
    expect(sequenceLabelPosition(rows[1], 1, positions)?.x).toBe(79);
    expect(sequenceLabelPosition(rows[3], 3, positions)?.x).toBe(79);
    expect(rows[4].text).toBe('option: retry');
    expect(sequenceLabelPosition(rows[4], 4, positions)?.x).toBe(79);
    expect(sequenceRouteKeys(steps)).toEqual(['["participant:User","->>","participant:Server",0]']);
  });

  it('참조가 없는 블록은 현재 다이어그램을 따르고 누락된 대상이나 메시지는 설명을 만들지 않는다', () => {
    const empty = { id: 'empty', depth: 0, text: 'loop: empty', participants: [] };
    expect(sequenceLabelPosition(empty, 0, layout)).toEqual({ x: 139, y: 200, textAnchor: 'end' });
    expect(sequenceLabelPosition(empty, 0, {})).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, target: 'missing' }, 0, layout)).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, from: 'participant:User' }, 0, layout)).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, participants: ['missing'] }, 0, layout)).toBeUndefined();
  });
});

describe('시퀀스 화살표의 수직 위치 [SPEC-2.2]', () => {
  const document = (offsetY?: number): DiagramDocument => ({
    layout, source: offsetY === undefined ? '' : '%% @se-uml-route ' + JSON.stringify({
      key: '["participant:User","->>","participant:Server",0]', points: [], offsetY,
    }),
    model: { kind: 'sequence', participants: [], steps: [
      { id: 'm1', kind: 'message', from: 'participant:User', to: 'participant:Server', arrow: '->>', text: 'call' },
      { id: 'a', kind: 'activation', target: 'participant:Server', action: 'activate' },
      { id: 'm2', kind: 'message', from: 'participant:Server', to: 'participant:User', arrow: '-->>', text: 'reply' },
      { id: 'd', kind: 'activation', target: 'participant:Server', action: 'deactivate' },
    ] },
  });
  it('양 끝을 생명선에 붙인 채 이동하고 뒤의 설명과 메시지를 순서대로 밀어낸다 [SPEC-1.3]', () => {
    const doc = document(100);
    expect(sequenceRowPositions(doc)).toEqual([300, 324, 348, 395]);
    const [first, second] = canvasEdges(doc);
    expect(first.points).toEqual([{ x: 155, y: 300 }, { x: 445, y: 300 }]);
    expect(second.points).toEqual([{ x: 445, y: 348 }, { x: 155, y: 348 }]);
    expect(first.sequence).toEqual({ offsetY: 100, storedOffsetY: 100, minY: 164 });
    if (doc.model.kind !== 'sequence') throw new Error('Expected sequence');
    const on = sequenceRows(doc.model.steps)[1];
    expect(sequenceLabelPosition(on, 1, layout, sequenceRowPositions(doc)[1]))
      .toEqual({ x: 139, y: 324, textAnchor: 'end' });
  });
  it('옛 파일은 기존 높이를 유지하고 위로 이동해도 참여자 박스 안으로 들어가지 않는다', () => {
    expect(sequenceRowPositions(document())).toEqual([200, 265, 330, 395]);
    expect(sequenceRowPositions(document(-1000))).toEqual([164, 265, 330, 395]);
    expect(sequenceRowPositions({ source: '', model: { kind: 'class', nodes: [], relations: [] }, layout: {} })).toEqual([]);
  });
});
