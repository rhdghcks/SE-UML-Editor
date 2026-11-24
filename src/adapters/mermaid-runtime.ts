import mermaid from 'mermaid';
import type { DiagramModel } from '../core/types';

export type MermaidDiagram = Awaited<ReturnType<typeof mermaid.mermaidAPI.getDiagramFromText>>;

export interface MermaidRuntime {
  parse(kind: DiagramModel['kind'], source: string): MermaidDiagram;
}

export async function loadMermaidRuntime(): Promise<MermaidRuntime> {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const classDiagram = await mermaid.mermaidAPI.getDiagramFromText('classDiagram\nclass Seed');
  const sequenceDiagram = await mermaid.mermaidAPI.getDiagramFromText('sequenceDiagram\nparticipant Seed');
  const diagrams = { class: classDiagram, sequence: sequenceDiagram };
  return {
    parse(kind, source) {
      const diagram = diagrams[kind];
      const parser = diagram.getParser();
      if (!parser.parser || !diagram.db.clear) throw new Error('Mermaid 동기 파서를 사용할 수 없습니다.');
      // The pinned Jison grammars are synchronous. Preview rendering can rebind the shared parser.
      diagram.db.clear();
      parser.parser.yy = diagram.db;
      const code = source.split(/\r?\n/).map(line => line.trimStart().startsWith('%%') ? '' : line).join('\n');
      const result = parser.parse(code + '\n');
      if (result instanceof Promise) throw new Error('Mermaid 파서 버전이 동기 계약과 호환되지 않습니다.');
      return diagram;
    },
  };
}
