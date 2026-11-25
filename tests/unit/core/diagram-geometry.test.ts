import { describe, expect, it } from 'vitest';
import { sequenceLabelPosition, sequenceRouteKeys, sequenceRows } from '../../../src/core/diagram-geometry';
import type { LayoutMap, SequenceStep } from '../../../src/core/types';

const box = { x: 60, y: 70, width: 190, height: 70, color: '#ffffff' };
const layout: LayoutMap = {
  'participant:User': { ...box }, 'participant:Server': { ...box, x: 350 },
};

describe('시퀀스 설명의 참여자 기준 위치 [SPEC-1.3][SPEC-2.1]', () => {
  it('활성화·비활성화는 대상 생명선을 따라가고 좌우 순서가 바뀌면 안쪽을 향한다', () => {
    const steps: SequenceStep[] = [
      { id: 'on', kind: 'activation', target: 'participant:Server', action: 'activate' },
      { id: 'off', kind: 'activation', target: 'participant:Server', action: 'deactivate' },
    ];
    const [on, off] = sequenceRows(steps);
    expect(sequenceLabelPosition(on, 1, layout)).toEqual({ x: 433, y: 265, textAnchor: 'end' });
    const reordered = { ...layout, 'participant:User': { ...box, x: 610 } };
    expect(sequenceLabelPosition(on, 1, reordered)).toEqual({ x: 457, y: 265, textAnchor: 'start' });
    const moved = { ...reordered, 'participant:Server': { ...box, x: 450, y: 90, width: 230 } };
    expect(sequenceLabelPosition(off, 3, moved)).toEqual({ x: 577, y: 415, textAnchor: 'start' });
    expect(layout['participant:Server']).toEqual({ ...box, x: 350 });
  });

  it('중첩 critical·option·alt 설명은 해당 블록의 참조 참여자 중 가장 왼쪽을 따른다', () => {
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
    expect(sequenceLabelPosition(rows[0], 0, positions)).toEqual({ x: 72, y: 200, textAnchor: 'start' });
    expect(sequenceLabelPosition(rows[1], 1, positions)).toEqual({ x: 84, y: 265, textAnchor: 'start' });
    positions['participant:User'] = { ...box, x: 610 };
    expect(sequenceLabelPosition(rows[0], 0, positions)?.x).toBe(362);
    expect(sequenceLabelPosition(rows[1], 1, positions)?.x).toBe(374);
    expect(sequenceLabelPosition(rows[3], 3, positions)?.x).toBe(374);
    expect(rows[4].text).toBe('option: retry');
    expect(sequenceLabelPosition(rows[4], 4, positions)?.x).toBe(362);
    expect(sequenceRouteKeys(steps)).toEqual(['["participant:User","->>","participant:Server",0]']);
  });

  it('참조가 없는 블록은 현재 다이어그램을 따르고 누락된 대상이나 메시지는 설명을 만들지 않는다', () => {
    const empty = { id: 'empty', depth: 0, text: 'loop: empty', participants: [] };
    expect(sequenceLabelPosition(empty, 0, layout)).toEqual({ x: 72, y: 200, textAnchor: 'start' });
    expect(sequenceLabelPosition(empty, 0, {})).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, target: 'missing' }, 0, layout)).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, from: 'participant:User' }, 0, layout)).toBeUndefined();
    expect(sequenceLabelPosition({ ...empty, participants: ['missing'] }, 0, layout)).toBeUndefined();
  });
});
