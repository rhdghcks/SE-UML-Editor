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
