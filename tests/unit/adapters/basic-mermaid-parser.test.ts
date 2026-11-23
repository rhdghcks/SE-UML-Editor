import { describe, expect, it } from 'vitest';
import { BasicMermaidParser } from '../../../src/adapters/basic-mermaid-parser';
import { BasicMermaidSerializer } from '../../../src/adapters/basic-mermaid-serializer';
import { readLayoutMetadata, writeLayoutMetadata } from '../../../src/core/layout-metadata';
import type {
  ClassConnector, ClassDiagram, DiagramModel, MessageArrow, SequenceBlock, SequenceDiagram,
} from '../../../src/core/types';

const parser = new BasicMermaidParser();
const serializer = new BasicMermaidSerializer();

const asClass = (model: DiagramModel): ClassDiagram => {
  if (model.kind !== 'class') throw new Error(`class 모델이 아님: ${model.kind}`);
  return model;
};
const asSequence = (model: DiagramModel): SequenceDiagram => {
  if (model.kind !== 'sequence') throw new Error(`sequence 모델이 아님: ${model.kind}`);
  return model;
};
const asBlock = (step: SequenceDiagram['steps'][number]): SequenceBlock => {
  if (step.kind !== 'block') throw new Error(`block 단계가 아님: ${step.kind}`);
  return step;
};

describe('starter Mermaid adapters', () => {
  it('parses class declarations, members and relationships', () => {
    const model = parser.parse(`classDiagram
class User {
+name: string
+save()
}
User --> Account : uses`);
    expect(model.kind).toBe('class');
    if (model.kind !== 'class') return;
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0].methods).toEqual(['+save()']);
    expect(model.relations[0].to).toBe('class:Account');
    expect(parser.parse(serializer.serialize(model))).toEqual(model);
  });

  it('parses nested sequence blocks', () => {
    const model = parser.parse(`sequenceDiagram
participant A
participant B
alt authorized
 A->>B: query
 loop retry
 B-->>A: pending
 end
else unauthorized
 B-->>A: reject
end`);
    expect(model.kind).toBe('sequence');
    if (model.kind !== 'sequence') return;
    expect(model.steps[0].kind).toBe('block');
    expect(parser.parse(serializer.serialize(model))).toEqual(model);
  });

  it('rejects unsupported syntax instead of dropping it', () => {
    expect(() => parser.parse('sequenceDiagram\npar A')).toThrow('2행');
    expect(() => parser.parse('sequenceDiagram\nend')).toThrow('2행');
  });

  it('rejects corrupt saved layout comments', () => {
    expect(() => readLayoutMetadata('classDiagram\n%% @se-uml-layout nope'))
      .toThrow('JSON');
    expect(() => readLayoutMetadata('classDiagram\n%% @se-uml-layout {"version":2,"nodes":{}}'))
      .toThrow('버전');
  });

  it('keeps Mermaid text unchanged when attaching layout metadata', () => {
    const source = 'classDiagram\n  class A';
    const metadata = writeLayoutMetadata(source, { 'class:A': {
      x: 10, y: 20, width: 200, height: 120, color: '#ffffff',
    } });
    const extracted = readLayoutMetadata(metadata);
    expect(extracted.code).toBe(source);
    expect(extracted.layout?.['class:A'].width).toBe(200);
  });
});

// 수행 목적: 스모크. App.tsx의 초기 예제와 같은 입력이다. 이 둘이 깨지면 첫 화면이 열리지 않는다.
describe('smoke: 앱 기본 예제', () => {
  it('클래스 예제를 파싱한다', () => {
    const model = asClass(parser.parse(`classDiagram
  class User {
    +name: string
    +login()
  }
  class Session
  User --> Session : creates`));
    expect(model.nodes.map((n) => n.id)).toEqual(['class:User', 'class:Session']);
    expect(model.relations).toHaveLength(1);
  });

  it('시퀀스 예제를 파싱한다', () => {
    const model = asSequence(parser.parse(`sequenceDiagram
  participant User
  participant Server
  User->>Server: login()
  activate Server
  Server-->>User: token
  deactivate Server
  alt valid token
    User->>Server: getProfile()
  else expired
    Server-->>User: unauthorized
  end`));
    expect(model.participants.map((p) => p.id)).toEqual(['participant:User', 'participant:Server']);
    expect(model.steps.map((s) => s.kind)).toEqual(['message', 'activation', 'message', 'activation', 'block']);
  });
});

// 설계 관점: 블랙박스(동등 분할 + 경계값). 입력 영역별로 유효·무효 클래스와 경계를 표로 나눈다.
describe('블랙박스: 헤더와 입력 전처리', () => {
  it.each([
    ['빈 문자열', ''],
    ['공백만', '   \n\t\n'],
    ['주석만', '%% only comment\n%% another'],
  ])('내용이 없으면 거부한다: %s', (_, source) => {
    expect(() => parser.parse(source)).toThrow('비어 있습니다');
  });

  it.each([
    ['알 수 없는 헤더', 'flowchart TD', '1행'],
    ['헤더 오타', 'classDiagram-v2', '1행'],
    ['초기화 지시문', '%%{init: {}}%%\nclassDiagram', '1행'],
    ['빈 줄 뒤 잘못된 헤더', '\n\nerDiagram', '3행'],
  ])('지원 헤더가 아니면 행 번호와 함께 거부한다: %s', (_, source, line) => {
    expect(() => parser.parse(source)).toThrow(line);
  });

  it.each([
    ['헤더만 있는 클래스', 'classDiagram', 'class'],
    ['헤더만 있는 시퀀스', 'sequenceDiagram', 'sequence'],
    ['헤더 앞 빈 줄과 주석', '\n%% note\n  classDiagram', 'class'],
  ])('경계 입력을 받아들인다: %s', (_, source, kind) => {
    expect(parser.parse(source).kind).toBe(kind);
  });

  it('CRLF와 LF는 같은 모델을 만든다', () => {
    const lf = 'classDiagram\nclass A {\n+x\n}\nA --> B\n';
    expect(parser.parse(lf.replace(/\n/g, '\r\n'))).toEqual(parser.parse(lf));
  });

  it('끝 줄바꿈 유무는 모델에 영향이 없다', () => {
    expect(parser.parse('sequenceDiagram\nA->>B: hi\n'))
      .toEqual(parser.parse('sequenceDiagram\nA->>B: hi'));
  });
});

describe('블랙박스: 식별자', () => {
  it.each(['A', '_a', 'A1', 'a_b_C9', '__proto__', 'constructor'])('유효 식별자 %s', (name) => {
    const model = asClass(parser.parse(`classDiagram\nclass ${name}`));
    expect(model.nodes).toEqual([
      { id: `class:${name}`, kind: 'class', name, attributes: [], methods: [] },
    ]);
  });

  it.each(['1A', '사용자', 'A-B', 'A.B'])('무효 식별자 %s 는 2행 오류', (name) => {
    expect(() => parser.parse(`classDiagram\nclass ${name}`)).toThrow('2행');
  });
});

describe('블랙박스: 클래스 관계', () => {
  const connectors: ClassConnector[] = ['<|--', '--|>', '*--', 'o--', '-->', '--', '..>', '..|>'];

  it.each(connectors)('연결자 %s 를 그대로 보존한다', (connector) => {
    const model = asClass(parser.parse(`classDiagram\nA ${connector} B`));
    expect(model.relations[0]).toMatchObject({
      from: 'class:A', to: 'class:B', connector, label: '',
    });
  });

  it.each([
    ['라벨 있음', 'A --> B : uses', 'uses'],
    ['라벨 안 콜론', 'A --> B : a:b', 'a:b'],
    ['공백 없는 표기', 'A-->B:uses', 'uses'],
    ['빈 라벨', 'A --> B :', ''],
  ])('라벨 경계: %s', (_, line, label) => {
    expect(asClass(parser.parse(`classDiagram\n${line}`)).relations[0].label).toBe(label);
  });

  it.each(['A <.. B', 'A --o B', 'A ==> B', 'A -->'])('미지원 관계 %s 는 2행 오류', (line) => {
    expect(() => parser.parse(`classDiagram\n${line}`)).toThrow('2행');
  });

  it('관계로 처음 등장한 클래스도 노드가 되고 관계 ID는 순서 번호를 가진다', () => {
    const model = asClass(parser.parse('classDiagram\nA --> B\nA --> B'));
    expect(model.nodes.map((n) => n.id)).toEqual(['class:A', 'class:B']);
    expect(model.relations.map((r) => r.id)).toEqual(['relation:A:-->:B:0', 'relation:A:-->:B:1']);
  });
});

describe('블랙박스: 시퀀스 메시지와 참여자', () => {
  const arrows: MessageArrow[] = ['->>', '-->>', '->', '-->'];

  it.each(arrows)('화살표 %s 를 구분한다', (arrow) => {
    const model = asSequence(parser.parse(`sequenceDiagram\nA${arrow}B: hi`));
    expect(model.steps[0]).toMatchObject({ kind: 'message', arrow, text: 'hi' });
  });

  it.each([
    ['텍스트 1글자', 'A->>B: x', 'x'],
    ['콜론 앞뒤 공백 없음', 'A->>B:x', 'x'],
    ['텍스트 안 콜론', 'A->>B: a: b', 'a: b'],
    ['자기 자신에게', 'A->>A: self', 'self'],
  ])('메시지 경계: %s', (_, line, text) => {
    expect(asSequence(parser.parse(`sequenceDiagram\n${line}`)).steps[0]).toMatchObject({ text });
  });

  it.each(['A->>B:', 'A->>B', 'A-x B: lost', 'A->>+B: activate'])('미지원 메시지 %s 는 2행 오류', (line) => {
    expect(() => parser.parse(`sequenceDiagram\n${line}`)).toThrow('2행');
  });

  it('participant와 actor, 별칭을 구분한다', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nparticipant A as Alice Kim\nactor B'));
    expect(model.participants).toEqual([
      { id: 'participant:A', kind: 'participant', name: 'A', displayName: 'Alice Kim', role: 'participant' },
      { id: 'participant:B', kind: 'participant', name: 'B', displayName: 'B', role: 'actor' },
    ]);
  });

  it('메시지로 먼저 등장한 참여자는 이후 선언으로 역할과 별칭을 갱신하되 순서를 유지한다', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nA->>B: hi\nactor B as Bob'));
    expect(model.participants.map((p) => [p.name, p.role, p.displayName]))
      .toEqual([['A', 'participant', 'A'], ['B', 'actor', 'Bob']]);
  });

  it('같은 참여자를 다시 선언하면 마지막 선언이 적용된다 (현재 동작 고정)', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nparticipant A as X\nparticipant A as Y'));
    expect(model.participants).toHaveLength(1);
    expect(model.participants[0].displayName).toBe('Y');
  });

  it('activate/deactivate는 대상 참여자를 만든다', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nactivate A\ndeactivate A'));
    expect(model.participants.map((p) => p.id)).toEqual(['participant:A']);
    expect(model.steps).toMatchObject([
      { kind: 'activation', action: 'activate', target: 'participant:A' },
      { kind: 'activation', action: 'deactivate', target: 'participant:A' },
    ]);
  });
});

describe('블랙박스: 블록 라벨', () => {
  it.each(['alt', 'opt', 'loop'] as const)('%s 는 라벨 없이도 열 수 있다', (operator) => {
    const model = asSequence(parser.parse(`sequenceDiagram\n${operator}\nA->>B: x\nend`));
    const block = asBlock(model.steps[0]);
    expect(block.operator).toBe(operator);
    expect(block.branches).toEqual([{ label: '', steps: [expect.objectContaining({ text: 'x' })] }]);
  });

  it('라벨 없는 else 를 받아들인다', () => {
    const block = asBlock(asSequence(parser.parse(
      'sequenceDiagram\nalt ok\nA->>B: x\nelse\nB->>A: y\nend')).steps[0]);
    expect(block.branches.map((b) => b.label)).toEqual(['ok', '']);
  });

  it.each(['alternative', 'optional x', 'looping', 'elsewhere', 'endless'])(
    '키워드로 시작하는 다른 단어 %s 는 블록으로 오인하지 않는다', (line) => {
      expect(() => parser.parse(`sequenceDiagram\nalt a\n${line}\nend`)).toThrow('3행');
    });
});

describe('블랙박스: 클래스 본문 멤버', () => {
  it.each([
    ['속성', '+name: string', 'attributes'],
    ['메서드', '+save()', 'methods'],
    ['인자 있는 메서드', '+find(id: number) User', 'methods'],
    ['가시성 없음', 'count', 'attributes'],
  ] as const)('%s 를 분류한다', (_, member, field) => {
    const node = asClass(parser.parse(`classDiagram\nclass A {\n${member}\n}`)).nodes[0];
    expect(node[field]).toEqual([member]);
  });

  it.each(['+x;', 'class B {', '+map: Map<{}>'])('금지 문자가 든 멤버 %s 는 3행 오류', (member) => {
    expect(() => parser.parse(`classDiagram\nclass A {\n${member}\n}`)).toThrow('3행');
  });

  it('본문 안 %% 주석은 멤버가 되지 않는다', () => {
    const node = asClass(parser.parse('classDiagram\nclass A {\n%% note\n+x\n}')).nodes[0];
    expect(node.attributes).toEqual(['+x']);
  });

  it('본문 안 %%{ 지시문은 3행 오류', () => {
    expect(() => parser.parse('classDiagram\nclass A {\n%%{init}%%\n}')).toThrow('3행');
  });
});

// 설계 관점: 상태 기반. 클래스는 Outside ⇄ InClassBody,
// 시퀀스는 블록 스택(깊이와 맨 위 연산자)이 상태다. 전이 표의 각 칸을 케이스로 만든다.
describe('상태 기반: 클래스 본문 전이', () => {
  it('Outside → InClassBody → Outside 후 다시 선언을 받는다', () => {
    const model = asClass(parser.parse('classDiagram\nclass A {\n+x\n}\nclass B {\n+y()\n}\nA --> B'));
    expect(model.nodes.map((n) => [n.name, n.attributes, n.methods]))
      .toEqual([['A', ['+x'], []], ['B', [], ['+y()']]]);
  });

  it('빈 본문 class A { } 도 닫힌다', () => {
    expect(asClass(parser.parse('classDiagram\nclass A {\n}')).nodes[0].attributes).toEqual([]);
  });

  it('같은 클래스를 다시 열면 멤버가 누적된다', () => {
    const node = asClass(parser.parse('classDiagram\nclass A {\n+x\n}\nclass A {\n+y\n}')).nodes[0];
    expect(node.attributes).toEqual(['+x', '+y']);
  });

  it('InClassBody 에서 관계 문법은 멤버로 취급한다 (현재 동작 고정)', () => {
    const node = asClass(parser.parse('classDiagram\nclass A {\nA --> B\n}')).nodes[0];
    expect(node.attributes).toEqual(['A --> B']);
  });

  it('Outside 에서 } 는 행 번호 오류', () => {
    expect(() => parser.parse('classDiagram\nclass A\n}')).toThrow('3행');
  });

  it('InClassBody 에서 EOF 이면 여는 줄 번호로 오류', () => {
    expect(() => parser.parse('classDiagram\nclass X\nclass A {\n+x'))
      .toThrow(/^3행: A 클래스의 중괄호가 닫히지 않았습니다 \(class A \{\)$/);
  });
});

describe('상태 기반: 시퀀스 블록 스택 전이', () => {
  it.each([
    ['깊이 0에서 end', 'end', '2행'],
    ['깊이 0에서 else', 'else x', '2행'],
    ['loop 안 else', 'loop r\nelse x\nend', '3행'],
    ['opt 안 else', 'opt r\nelse x\nend', '3행'],
    ['alt 안 loop 위에서 else', 'alt a\nloop r\nelse x\nend\nend', '4행'],
    ['end 가 하나 더 많음', 'loop r\nend\nend', '4행'],
  ])('잘못된 전이: %s', (_, body, line) => {
    expect(() => parser.parse(`sequenceDiagram\n${body}`)).toThrow(line);
  });

  it.each([
    ['깊이 1 미종료', 'loop retry\nA->>B: x', /^2행: loop 블록의 end가 빠졌습니다 \(loop retry\)$/],
    ['깊이 2 미종료는 가장 안쪽 블록을 가리킨다', 'alt a\nopt b\nA->>B: x', /^3행: opt 블록의 end가 빠졌습니다/],
    ['안쪽만 닫히면 바깥 블록을 가리킨다', 'alt a\nopt b\nA->>B: x\nend', /^2행: alt 블록의 end가 빠졌습니다/],
    ['else 뒤 미종료는 alt 를 가리킨다', 'alt a\nelse b', /^2행: alt 블록의 end가 빠졌습니다/],
  ])('EOF 에서 스택이 남음: %s', (_, body, message) => {
    expect(() => parser.parse(`sequenceDiagram\n${body}`)).toThrow(message);
  });

  it('end 후 단계는 바깥 수준으로 돌아간다', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nloop r\nA->>B: in\nend\nA->>B: out'));
    expect(model.steps.map((s) => s.kind)).toEqual(['block', 'message']);
    expect(asBlock(model.steps[0]).branches[0].steps).toHaveLength(1);
  });

  it('else 는 현재 alt 의 새 분기로 이후 단계를 옮긴다', () => {
    const block = asBlock(asSequence(parser.parse(
      'sequenceDiagram\nalt a\nA->>B: 1\nelse b\nA->>B: 2\nelse c\nA->>B: 3\nend')).steps[0]);
    expect(block.branches.map((b) => [b.label, b.steps.map((s) => s.kind === 'message' && s.text)]))
      .toEqual([['a', ['1']], ['b', ['2']], ['c', ['3']]]);
  });

  it('깊이 3 중첩에서 각 단계가 올바른 분기에 들어간다', () => {
    const model = asSequence(parser.parse(`sequenceDiagram
alt a
  loop l
    opt o
      A->>B: deep
    end
    A->>B: mid
  end
else b
  A->>B: alt2
end`));
    const alt = asBlock(model.steps[0]);
    const loop = asBlock(alt.branches[0].steps[0]);
    const opt = asBlock(loop.branches[0].steps[0]);
    expect(opt.branches[0].steps).toMatchObject([{ text: 'deep' }]);
    expect(loop.branches[0].steps[1]).toMatchObject({ text: 'mid' });
    expect(alt.branches[1].steps).toMatchObject([{ text: 'alt2' }]);
  });

  it('단계 ID 는 중첩과 무관하게 파싱 순서대로 증가한다', () => {
    const model = asSequence(parser.parse('sequenceDiagram\nA->>B: 0\nloop r\nactivate A\nend'));
    const loop = asBlock(model.steps[1]);
    expect([model.steps[0].id, loop.id, loop.branches[0].steps[0].id])
      .toEqual(['message:0', 'block:1', 'activation:2']);
  });
});

// 검증 대상: 사용성(오류 품질). 팀 계약 "행 번호가 있는 문법 오류"를 모든 실패 경로에 대해 확인한다.
describe('오류 품질: 행 번호와 원문', () => {
  it.each([
    ['미지원 클래스 문법', 'classDiagram\n\nnamespace X', 3, 'namespace X'],
    ['미지원 시퀀스 문법', 'sequenceDiagram\nnote over A: hi', 2, 'note over A: hi'],
    ['CRLF 에서 행 번호', 'sequenceDiagram\r\nA->>B: x\r\npar', 3, 'par'],
    ['닫히지 않은 클래스', 'classDiagram\n%% c\nclass A {', 3, 'class A {'],
    ['닫히지 않은 블록', 'sequenceDiagram\nopt x', 2, 'opt x'],
    ['들여쓴 줄은 trim 한 원문', 'sequenceDiagram\n    par', 2, 'par'],
  ])('%s', (_, source, line, text) => {
    expect(() => parser.parse(source)).toThrow(new RegExp(`^${line}행: .+ \\(${escapeRegExp(text)}\\)$`));
  });
});

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 테스트 수준: 통합(Parser ↔ Serializer, Parser ↔ 배치 주석). 수행 목적: 회귀.
describe('왕복: parse → serialize → parse', () => {
  const fixtures: Array<[string, string]> = [
    ['빈 클래스', 'classDiagram'],
    ['연결자 8종', `classDiagram\n${['<|--', '--|>', '*--', 'o--', '-->', '--', '..>', '..|>']
      .map((c, i) => `A${i} ${c} B${i} : r${i}`).join('\n')}`],
    ['멤버와 빈 클래스', 'classDiagram\nclass A {\n+x: int\n-y()\n}\nclass B'],
    ['빈 시퀀스', 'sequenceDiagram'],
    ['별칭과 actor', 'sequenceDiagram\nactor U as User Name\nparticipant S'],
    ['화살표 4종', 'sequenceDiagram\nA->>B: 1\nA-->>B: 2\nA->B: 3\nA-->B: 4'],
    ['라벨 없는 블록', 'sequenceDiagram\nalt\nA->>B: x\nelse\nB->>A: y\nend\nloop\nactivate A\nend'],
    ['깊은 중첩', 'sequenceDiagram\nalt a\nloop b\nopt c\nA->>B: x\nend\nend\nelse d\nend'],
  ];

  it.each(fixtures)('%s', (_, source) => {
    const model = parser.parse(source);
    expect(parser.parse(serializer.serialize(model))).toEqual(model);
  });

  it('배치 주석을 붙였다 떼어도 파싱 결과가 같다', () => {
    const source = 'sequenceDiagram\nparticipant A\nA->>B: hi';
    const withLayout = writeLayoutMetadata(source, {
      'participant:A': { x: 0, y: 0, width: 100, height: 40, color: '#ffffff' },
    });
    expect(parser.parse(readLayoutMetadata(withLayout).code)).toEqual(parser.parse(source));
  });

  it('배치 주석은 %% 주석이라 파서가 직접 읽어도 무시한다', () => {
    const source = 'classDiagram\nclass A\n%% @se-uml-layout {"version":1,"nodes":{}}';
    expect(parser.parse(source)).toEqual(parser.parse('classDiagram\nclass A'));
  });
});

// 검증 대상: 견고성·성능. 1초 목표(입력→SVG)의 일부만 차지하는지 상한으로 확인한다. 정밀 측정이 아니다.
describe('견고성·성능 상한', () => {
  it('파싱은 입력 문자열을 바꾸지 않고 호출마다 독립된 모델을 만든다', () => {
    const source = 'classDiagram\nclass A {\n+x\n}';
    const first = asClass(parser.parse(source));
    first.nodes[0].attributes.push('mutated');
    expect(asClass(parser.parse(source)).nodes[0].attributes).toEqual(['+x']);
  });

  it('참여자 30명과 메시지 300개를 100ms 안에 파싱한다', () => {
    const names = Array.from({ length: 30 }, (_, i) => `P${i}`);
    const source = ['sequenceDiagram', ...names.map((n) => `participant ${n}`),
      ...Array.from({ length: 300 }, (_, i) => `${names[i % 30]}->>${names[(i + 1) % 30]}: m${i}`)].join('\n');
    const start = performance.now();
    const model = asSequence(parser.parse(source));
    expect(performance.now() - start).toBeLessThan(100);
    expect(model.participants).toHaveLength(30);
    expect(model.steps).toHaveLength(300);
  });

  it('1만 줄 입력도 처리한다', () => {
    const source = `classDiagram\n${Array.from({ length: 10_000 }, (_, i) => `A --> B : ${i}`).join('\n')}`;
    expect(asClass(parser.parse(source)).relations).toHaveLength(10_000);
  });

  it.each([
    ['긴 식별자 뒤 잘못된 연결자', `classDiagram\n${'A'.repeat(50_000)} ~~ B`],
    ['긴 공백 뒤 실패', `sequenceDiagram\nA${' '.repeat(50_000)}x`],
    ['긴 메시지 텍스트 없는 콜론', `sequenceDiagram\n${'A'.repeat(50_000)}->>B`],
  ])('정규식 역추적이 선형 시간 안에 실패한다: %s', (_, source) => {
    const start = performance.now();
    expect(() => parser.parse(source)).toThrow('2행');
    expect(performance.now() - start).toBeLessThan(200);
  });
});
