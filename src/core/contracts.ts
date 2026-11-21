import type {
  DiagramDocument,
  DiagramModel,
  EditorSnapshot,
  LayoutMap,
  NodeLayout,
} from './types';

export interface IParser {
  parse(source: string): DiagramModel;
}

export interface ISerializer {
  serialize(model: DiagramModel): string;
}

export interface ILayoutEngine {
  layout(model: DiagramModel, previous: LayoutMap): LayoutMap;
}

export interface IRenderer<TOutput> {
  render(document: DiagramDocument): Promise<TOutput>;
}

export interface IDiagramStore {
  getSnapshot(): EditorSnapshot;
  getPersistedSource(): string;
  subscribe(listener: () => void): () => void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export interface ISnapStrategy {
  snap(point: LayoutChange, id: string, layout: LayoutMap): LayoutChange;
}

export interface IDiagramEditor extends IDiagramStore {
  openSource(source: string): void;
  updateSource(source: string): void;
  moveNode(id: string, x: number, y: number): void;
  resizeNode(id: string, width: number, height: number): void;
  setNodeColor(id: string, color: string): void;
  undo(): void;
  redo(): void;
}

export interface IFileManager {
  read(file: Blob): Promise<string>;
  write(source: string): Promise<void>;
}

export interface IImageExporter {
  export(document: DiagramDocument, format: 'png' | 'jpeg'): Promise<Blob>;
}

export type LayoutChange = Pick<NodeLayout, 'x' | 'y'>;
