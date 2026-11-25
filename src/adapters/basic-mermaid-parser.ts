import type { IParser } from '../core/contracts';
import type {
  ClassConnector, ClassDiagram, ClassNode, ClassRelation, DiagramModel,
  MessageArrow, Participant, SequenceBlock, SequenceBranch,
  SequenceDiagram, SequenceStep,
} from '../core/types';

type SourceLine = { lineNumber: number; text: string };
const ID = '[A-Za-z_][A-Za-z0-9_]*';
const RELATION = /^([A-Za-z_]\w*)\s*(<\|--|--\|>|\*--|o--|-->|--|\.\.>|\.\.\|>)\s*([A-Za-z_]\w*)(?:\s*:\s*(.*))?$/;
const MESSAGE = /^([A-Za-z_][\w]*)\s*(-->>|->>|-->|->)\s*([A-Za-z_][\w]*)\s*:\s*(.+)$/;

function fail(line: SourceLine, message: string): never {
  throw new Error(`${line.lineNumber}행: ${message} (${line.text})`);
}

function inputLines(source: string): SourceLine[] {
  return source.split(/\r?\n/).map((text, index) => ({
    lineNumber: index + 1, text: text.trim(),
  })).filter(({ text }) => text !== '' && (!text.startsWith('%%') || text.startsWith('%%{')));
}

function parseClass(lines: SourceLine[]): ClassDiagram {
  const nodes = new Map<string, ClassNode>();
  const relations: ClassRelation[] = [];
  let openClass: ClassNode | null = null;
  let relationIndex = 0;
  let classStart = lines[0];

  const ensureClass = (name: string): ClassNode => {
    if (!nodes.has(name)) {
      nodes.set(name, { id: `class:${name}`, kind: 'class', name,
        attributes: [], methods: [] });
    }
    return nodes.get(name)!;
  };

  for (const line of lines.slice(1)) {
    if (openClass) {
      if (line.text === '}') {
        openClass = null;
      } else {
        if (/[{};]/.test(line.text) || line.text.startsWith('%%')) fail(line, '지원하지 않는 멤버 선언');
        if (line.text.includes('(')) openClass.methods.push(line.text);
        else openClass.attributes.push(line.text);
      }
      continue;
    }

    const classMatch = line.text.match(new RegExp(`^class\\s+(${ID})(\\s*\\{)?$`));
    if (classMatch) {
      const node = ensureClass(classMatch[1]);
      if (classMatch[2]) {
        openClass = node;
        classStart = line;
      }
      continue;
    }

    const member = /^([A-Za-z_]\w*)\s*:\s*([^{};]+)$/.exec(line.text);
    if (member) {
      const node = ensureClass(member[1]);
      const text = member[2].trim();
      if (text.includes('(')) node.methods.push(text);
      else node.attributes.push(text);
      continue;
    }

    const relationMatch = line.text.match(RELATION);
    if (relationMatch) {
      const [, from, connector, to, label = ''] = relationMatch;
      ensureClass(from);
      ensureClass(to);
      relations.push({ id: `relation:${from}:${connector}:${to}:${relationIndex++}`,
        from: `class:${from}`, to: `class:${to}`, connector: connector as ClassConnector,
        label });
      continue;
    }
    fail(line, '지원하지 않는 클래스 다이어그램 문법');
  }
  if (openClass) fail(classStart, `${openClass.name} 클래스의 중괄호가 닫히지 않았습니다`);
  return { kind: 'class', nodes: [...nodes.values()], relations };
}

function parseSequence(lines: SourceLine[]): SequenceDiagram {
  const participants = new Map<string, Participant>();
  const steps: SequenceStep[] = [];
  const stack: Array<{ block: SequenceBlock; current: SequenceBranch; start: SourceLine }> = [];
  let index = 0;
  const activationCounts = new Map<string, number>();
  const ensureParticipant = (name: string, displayName = name,
    role?: 'participant' | 'actor') => {
    if (!participants.has(name)) participants.set(name, {
      id: `participant:${name}`, kind: 'participant', name, displayName, role: role ?? 'participant',
    });
    else if (role) {
      const item = participants.get(name)!;
      item.displayName = displayName;
      item.role = role;
    }
  };
  const append = (step: SequenceStep) => {
    if (!stack.length) steps.push(step);
    else stack[stack.length - 1].current.steps.push(step);
  };

  for (const line of lines.slice(1)) {
    const participantMatch = line.text.match(new RegExp(`^(participant|actor)\\s+(${ID})(?:\\s+as\\s+(.+))?$`));
    if (participantMatch) {
      ensureParticipant(participantMatch[2], participantMatch[3] || participantMatch[2],
        participantMatch[1] as 'participant' | 'actor');
      continue;
    }

    const messageMatch = line.text.match(MESSAGE);
    if (messageMatch) {
      const [, from, arrow, to, text] = messageMatch;
      ensureParticipant(from);
      ensureParticipant(to);
      append({ id: `message:${index++}`, kind: 'message', from: `participant:${from}`,
        to: `participant:${to}`, arrow: arrow as MessageArrow, text });
      continue;
    }

    const activation = line.text.match(new RegExp(`^(activate|deactivate)\\s+(${ID})$`));
    if (activation) {
      const [, action, name] = activation;
      const active = activationCounts.get(name) ?? 0;
      if (action === 'deactivate' && active === 0) fail(line, '활성화되지 않은 참여자: ' + name);
      activationCounts.set(name, active + (action === 'activate' ? 1 : -1));
      ensureParticipant(name);
      append({ id: `activation:${index++}`, kind: 'activation',
        target: `participant:${activation[2]}`,
        action: activation[1] as 'activate' | 'deactivate' });
      continue;
    }

    const blockStart = line.text.match(/^(alt|opt|loop|critical)(?:\s+(.+))?$/);
    if (blockStart) {
      const branch: SequenceBranch = { label: blockStart[2] ?? '', steps: [] };
      const block: SequenceBlock = { id: `block:${index++}`, kind: 'block',
        operator: blockStart[1] as SequenceBlock['operator'], branches: [branch] };
      append(block);
      stack.push({ block, current: branch, start: line });
      continue;
    }

    const division = /^(else|option)(?:\s+(.*))?$/.exec(line.text);
    if (division) {
      const top = stack[stack.length - 1];
      const operator = division[1] === 'else' ? 'alt' : 'critical';
      if (!top || top.block.operator !== operator) {
        fail(line, division[1] + '는 ' + operator + ' 블록 안에서만 사용할 수 있습니다');
      }
      const branch: SequenceBranch = { label: division[2] ?? '', steps: [] };
      top.block.branches.push(branch);
      top.current = branch;
      continue;
    }

    if (line.text === 'end') {
      if (!stack.pop()) fail(line, '대응하는 alt/opt/loop/critical가 없습니다');
      continue;
    }

    fail(line, '지원하지 않는 시퀀스 다이어그램 문법');
  }
  const unclosed = stack.at(-1);
  if (unclosed) fail(unclosed.start, `${unclosed.block.operator} 블록의 end가 빠졌습니다`);
  return { kind: 'sequence', participants: [...participants.values()], steps };
}

/** Only the documented Mermaid subset is supported by this starter adapter. */
export class BasicMermaidParser implements IParser {
  parse(source: string): DiagramModel {
    const lines = inputLines(source);
    if (!lines.length) throw new Error('다이어그램 코드가 비어 있습니다.');
    if (lines[0].text === 'classDiagram') return parseClass(lines);
    if (lines[0].text === 'sequenceDiagram') return parseSequence(lines);
    fail(lines[0], 'classDiagram 또는 sequenceDiagram으로 시작해야 합니다');
  }
}
