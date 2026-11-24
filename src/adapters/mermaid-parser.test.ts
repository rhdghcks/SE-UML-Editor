import { describe, expect, it } from 'vitest';
import { BasicMermaidParser } from './basic-mermaid-parser';
import { BasicMermaidSerializer } from './basic-mermaid-serializer';
import { MermaidParser } from './mermaid-parser';
import { validateModel } from '../core/validation';

const basic = new BasicMermaidParser();

describe('M1 parser contract', () => {
  it('checks support with original line numbers before calling the Mermaid runtime', () => {
    let called = false;
    const parser = new MermaidParser(basic, { parse() {
      called = true;
      throw new Error('unexpected runtime call');
    } });
    expect(() => parser.parse('sequenceDiagram\r\n%% comment\r\noption misplaced')).toThrow('3행');
    expect(called).toBe(false);
    expect(() => parser.parse('sequenceDiagram\ncritical main\nelse wrong\nend')).toThrow('3행');
    expect(called).toBe(false);
  });

  it('validates and round-trips nested critical blocks and ordered options', () => {
    const model = basic.parse([
      'sequenceDiagram', 'critical main', 'critical inner', 'A->>B: request', 'end',
      'option retry', 'B-->>A: wait', 'option deny', 'B-->>A: reject', 'end',
    ].join('\n'));
    validateModel(model);
    const output = new BasicMermaidSerializer().serialize(model);
    expect(output).toContain('  option retry');
    expect(output).toContain('  option deny');
    expect(basic.parse(output)).toEqual(model);
  });
});

it('locates inactive-participant errors and round-trips balanced nested activations', () => {
  const parser = new MermaidParser(basic, { parse() {
    throw new Error('should reject before the runtime');
  } });
  expect(() => parser.parse('sequenceDiagram\r\nparticipant A\r\n%% comment\r\ndeactivate A'))
    .toThrow('4행: 활성화되지 않은 참여자: A');
  const source = 'sequenceDiagram\nparticipant A as 고객\nactor B as 담당자\nactivate B\nactivate B\nA->>B: 요청\n' +
    'B-->>A: 응답\nA->B: 단방향\nB-->A: 확인\ndeactivate B\ndeactivate B';
  const model = basic.parse(source);
  validateModel(model);
  expect(basic.parse(new BasicMermaidSerializer().serialize(model))).toEqual(model);
});
