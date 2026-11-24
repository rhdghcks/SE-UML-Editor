import type { ClassDiagram, MessageArrow, SequenceBlock, SequenceDiagram } from '../core/types';
import type { MermaidDiagram } from './mermaid-runtime';

type SequenceDb = {
  getActors(): Map<string, { description: string; type: string }>;
  getMessages(): { type?: number; from?: string; to?: string; message: unknown }[];
  LINETYPE: Record<'SOLID' | 'DOTTED' | 'SOLID_OPEN' | 'DOTTED_OPEN' | 'ALT_START' | 'ALT_ELSE' | 'ALT_END' |
    'LOOP_START' | 'LOOP_END' | 'OPT_START' | 'OPT_END' | 'ACTIVE_START' | 'ACTIVE_END' |
    'CRITICAL_START' | 'CRITICAL_OPTION' | 'CRITICAL_END', number>;
};
type ClassDb = {
  getClasses(): Map<string, unknown>;
  getRelations(): { id1: string; id2: string }[];
};

function isClassDb(db: object): db is ClassDb {
  return 'getClasses' in db && typeof db.getClasses === 'function' &&
    'getRelations' in db && typeof db.getRelations === 'function';
}

function isSequenceDb(db: object): db is SequenceDb {
  return 'getActors' in db && typeof db.getActors === 'function' &&
    'getMessages' in db && typeof db.getMessages === 'function' && 'LINETYPE' in db;
}

export function classModel(diagram: MermaidDiagram, supported: ClassDiagram): ClassDiagram {
  if (!isClassDb(diagram.db)) throw new Error('Mermaid 클래스 파서 DB를 사용할 수 없습니다.');
  const nodes = new Map(supported.nodes.map(node => [node.name, node]));
  const classes = Array.from(diagram.db.getClasses().keys(), name => {
    const node = nodes.get(name);
    if (!node) throw new Error('Mermaid 클래스 식별자가 팀 모델과 일치하지 않습니다.');
    return node;
  });
  const relations = diagram.db.getRelations();
  if (classes.length !== nodes.size || relations.length !== supported.relations.length) {
    throw new Error('Mermaid 클래스 또는 관계를 팀 모델로 변환할 수 없습니다.');
  }
  return {
    kind: 'class', nodes: classes,
    relations: relations.map((relation, index) => {
      const original = supported.relations[index];
      const from = 'class:' + relation.id1;
      const to = 'class:' + relation.id2;
      if (from !== original.from || to !== original.to) throw new Error('Mermaid 관계의 양 끝을 변환할 수 없습니다.');
      return { ...original, from, to };
    }),
  };
}

export function sequenceModel(diagram: MermaidDiagram): SequenceDiagram {
  if (!isSequenceDb(diagram.db)) throw new Error('Mermaid 시퀀스 파서 DB를 사용할 수 없습니다.');
  const { db } = diagram;
  const types = db.LINETYPE;
  const arrows = new Map<number, MessageArrow>([
    [types.SOLID, '->>'], [types.DOTTED, '-->>'], [types.SOLID_OPEN, '->'], [types.DOTTED_OPEN, '-->'],
  ]);
  const starts = new Map<number, SequenceBlock['operator']>([
    [types.ALT_START, 'alt'], [types.LOOP_START, 'loop'], [types.OPT_START, 'opt'], [types.CRITICAL_START, 'critical'],
  ]);
  const ends = new Map<number, SequenceBlock['operator']>([
    [types.ALT_END, 'alt'], [types.LOOP_END, 'loop'], [types.OPT_END, 'opt'], [types.CRITICAL_END, 'critical'],
  ]);
  const participants: SequenceDiagram['participants'] = Array.from(db.getActors(), ([name, actor]) => ({
    id: 'participant:' + name, kind: 'participant', name, displayName: actor.description,
    role: actor.type === 'actor' ? 'actor' : 'participant',
  }));
  const steps: SequenceDiagram['steps'] = [];
  const blocks: SequenceBlock[] = [];
  let index = 0;
  for (const { type, from, to, message } of db.getMessages()) {
    if (type === undefined) throw new Error('지원하지 않는 Mermaid 이벤트입니다.');
    const block = blocks.at(-1);
    const current = block?.branches.at(-1)?.steps ?? steps;
    const operator = starts.get(type);
    const text = typeof message === 'string' ? message : '';
    if (operator) {
      const next: SequenceBlock = { kind: 'block', id: 'block:' + index++, operator, branches: [{ label: text, steps: [] }] };
      current.push(next);
      blocks.push(next);
    } else if (((type === types.ALT_ELSE && block?.operator === 'alt') ||
        (type === types.CRITICAL_OPTION && block?.operator === 'critical')) && block) {
      block.branches.push({ label: text, steps: [] });
    } else if (block && ends.get(type) === block.operator) {
      blocks.pop();
    } else if ((type === types.ACTIVE_START || type === types.ACTIVE_END) && from !== undefined) {
      current.push({ kind: 'activation', id: 'activation:' + index++, target: 'participant:' + from,
        action: type === types.ACTIVE_START ? 'activate' : 'deactivate' });
    } else {
      const arrow = arrows.get(type);
      if (!arrow || from === undefined || to === undefined) throw new Error('지원하지 않는 Mermaid 이벤트입니다.');
      current.push({ kind: 'message', id: 'message:' + index++, from: 'participant:' + from, to: 'participant:' + to,
        arrow, text });
    }
  }
  if (blocks.length) throw new Error('닫히지 않은 Mermaid 블록이 있습니다.');
  return { kind: 'sequence', participants, steps };
}
