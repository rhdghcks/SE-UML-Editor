import { describe, expect, it } from 'vitest';
import { BasicMermaidParser } from './basic-mermaid-parser';
import { BasicMermaidSerializer } from './basic-mermaid-serializer';
import { readLayoutMetadata, writeLayoutMetadata } from '../core/layout-metadata';

const parser = new BasicMermaidParser();
const serializer = new BasicMermaidSerializer();

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
