import type { ISerializer } from '../core/contracts';
import type { DiagramModel, SequenceStep } from '../core/types';

export class BasicMermaidSerializer implements ISerializer {
  serialize(model: DiagramModel): string {
    if (model.kind === 'class') {
      const lines = ['classDiagram'];
      for (const node of model.nodes) {
        if (!node.attributes.length && !node.methods.length) lines.push(`  class ${node.name}`);
        else {
          lines.push(`  class ${node.name} {`);
          for (const property of node.attributes) lines.push(`    ${property}`);
          for (const method of node.methods) lines.push(`    ${method}`);
          lines.push('  }');
        }
      }
      for (const relation of model.relations) {
        const from = relation.from.replace(/^class:/, '');
        const to = relation.to.replace(/^class:/, '');
        lines.push(`  ${from} ${relation.connector} ${to}${relation.label ? ` : ${relation.label}` : ''}`);
      }
      return lines.join('\n');
    }

    const lines = ['sequenceDiagram'];
    for (const participant of model.participants) {
      const alias = participant.name !== participant.displayName
        ? ` as ${participant.displayName}` : '';
      lines.push(`  ${participant.role} ${participant.name}${alias}`);
    }
    const appendSteps = (steps: SequenceStep[], indent: string) => {
      for (const step of steps) {
        if (step.kind === 'message') {
          lines.push(`${indent}${step.from.replace(/^participant:/, '')}${step.arrow}`
            + `${step.to.replace(/^participant:/, '')}: ${step.text}`);
        } else if (step.kind === 'activation') {
          lines.push(`${indent}${step.action} ${step.target.replace(/^participant:/, '')}`);
        } else {
          step.branches.forEach((branch, i) => {
            const keyword = i === 0 ? step.operator : step.operator === 'critical' ? 'option' : 'else';
            lines.push(indent + keyword + (branch.label ? ' ' + branch.label : ''));
            appendSteps(branch.steps, `${indent}  `);
          });
          lines.push(`${indent}end`);
        }
      }
    };
    appendSteps(model.steps, '  ');
    return lines.join('\n');
  }
}
