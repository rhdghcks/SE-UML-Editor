import type { IRenderer } from '../core/contracts';
import type { DiagramDocument } from '../core/types';
import { BasicMermaidSerializer } from './basic-mermaid-serializer';

let id = 0;
export class MermaidRenderer implements IRenderer<string> {
  constructor(private readonly serializer = new BasicMermaidSerializer()) {}

  async render(document: DiagramDocument) {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      themeVariables: { fontFamily: 'sans-serif', fontSize: '32px' } });
    const result = await mermaid.render(`uml-preview-${++id}`, this.serializer.serialize(document.model));
    return result.svg;
  }
}
