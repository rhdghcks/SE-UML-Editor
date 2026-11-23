export type DiagramKind = 'class' | 'sequence';

export interface ClassNode {
  id: string;
  kind: 'class';
  name: string;
  attributes: string[];
  methods: string[];
}

export type ClassConnector = '<|--' | '--|>' | '*--' | 'o--' | '-->' | '--' | '..>' | '..|>';

export interface ClassRelation {
  id: string;
  from: string;
  to: string;
  connector: ClassConnector;
  label: string;
}

export interface ClassDiagram {
  kind: 'class';
  nodes: ClassNode[];
  relations: ClassRelation[];
}

export interface Participant {
  id: string;
  kind: 'participant';
  name: string;
  displayName: string;
  role: 'participant' | 'actor';
}

export type MessageArrow = '->>' | '-->>' | '->' | '-->';

export interface SequenceMessage {
  id: string;
  kind: 'message';
  from: string;
  to: string;
  arrow: MessageArrow;
  text: string;
}

export interface SequenceActivation {
  id: string;
  kind: 'activation';
  target: string;
  action: 'activate' | 'deactivate';
}

export interface SequenceBranch {
  label: string;
  steps: SequenceStep[];
}

export interface SequenceBlock {
  id: string;
  kind: 'block';
  operator: 'alt' | 'opt' | 'loop';
  branches: SequenceBranch[];
}

export type SequenceStep = SequenceMessage | SequenceActivation | SequenceBlock;

export interface SequenceDiagram {
  kind: 'sequence';
  participants: Participant[];
  steps: SequenceStep[];
}

export type DiagramModel = ClassDiagram | SequenceDiagram;

export interface NodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  placement?: 'auto' | 'manual'; // v1 초기 파일에는 이 필드가 없다.
}

export type LayoutMap = Record<string, NodeLayout>;

export interface DiagramDocument {
  source: string;
  model: DiagramModel;
  layout: LayoutMap;
}

export interface EditorSnapshot extends DiagramDocument {
  error: string | null;
  origin: 'init' | 'code' | 'gui' | 'file' | 'undo' | 'redo';
  revision: number;
}

export function nodeIds(model: DiagramModel): string[] {
  return model.kind === 'class'
    ? model.nodes.map((node) => node.id)
    : model.participants.map((participant) => participant.id);
}
