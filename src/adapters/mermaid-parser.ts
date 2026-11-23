import type { IParser } from '../core/contracts';
import type { DiagramModel } from '../core/types';
import { classModel, sequenceModel } from './mermaid-model-mapping';
import type { MermaidRuntime } from './mermaid-runtime';

function locatedError(error: unknown, line: number) {
  if (error instanceof Error && /^\d+행:/.test(error.message)) return error;
  const message = error instanceof Error ? error.message : String(error);
  const parsed = /(?:line|Line)\s+(\d+)/.exec(message);
  return new Error((parsed?.[1] ?? line) + '행: ' + message, { cause: error });
}

export class MermaidParser implements IParser {
  constructor(private readonly supportedSyntax: IParser, private readonly runtime: MermaidRuntime) {}

  parse(source: string): DiagramModel {
    const lines = source.split(/\r?\n/);
    const header = Math.max(1, lines.findIndex(line => line.trim() && !line.trim().startsWith('%%')) + 1);
    try {
      const supported = this.supportedSyntax.parse(source);
      const diagram = this.runtime.parse(supported.kind, source);
      return supported.kind === 'class' ? classModel(diagram, supported) : sequenceModel(diagram);
    } catch (error) {
      throw locatedError(error, header);
    }
  }
}
