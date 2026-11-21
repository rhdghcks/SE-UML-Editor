import type { IDiagramEditor, ILayoutEngine, IParser, ISnapStrategy } from './contracts';
import { readLayoutMetadata, writeLayoutMetadata } from './layout-metadata';
import type { EditorSnapshot, LayoutMap, NodeLayout } from './types';
import { freezeSnapshot, validateLayout, validateModel } from './validation';

export class DiagramStore implements IDiagramEditor {
  private snapshot: EditorSnapshot;
  private valid: EditorSnapshot;
  private readonly past: EditorSnapshot[] = [];
  private readonly future: EditorSnapshot[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly parser: IParser, private readonly engine: ILayoutEngine,
    source: string, private readonly snap?: ISnapStrategy) {
    this.snapshot = this.parse(source, 'init', 0);
    this.valid = this.snapshot;
  }

  private parse(source: string, origin: EditorSnapshot['origin'], revision: number) {
    const { code, layout: saved } = readLayoutMetadata(source);
    const model = this.parser.parse(code);
    validateModel(model);
    const previous: LayoutMap = origin === 'code' && model.kind === this.valid.model.kind
      ? this.valid.layout : {};
    const layout = this.engine.layout(model, structuredClone({ ...previous, ...saved }));
    validateLayout(model, layout);
    return freezeSnapshot(structuredClone({ source, model, layout, error: null, origin, revision }));
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getPersistedSource = () => {
    if (this.snapshot.error) throw new Error('코드 오류를 수정한 뒤 저장하세요.');
    return writeLayoutMetadata(this.valid.source, this.valid.layout);
  };

  private publish(next: EditorSnapshot) {
    this.snapshot = freezeSnapshot(next);
    if (!next.error) this.valid = this.snapshot;
    for (const listener of this.listeners) listener();
  }

  private commit(next: EditorSnapshot) {
    this.past.push(this.valid);
    if (this.past.length > 5) this.past.shift();
    this.future.length = 0;
    this.publish(next);
  }

  updateSource = (source: string) => {
    if (source === this.snapshot.source) return;
    const revision = this.snapshot.revision + 1;
    let next: EditorSnapshot;
    try {
      next = this.parse(source, 'code', revision);
    } catch (error) {
      this.publish({ ...this.valid, source, origin: 'code', revision,
        error: error instanceof Error ? error.message : '코드를 해석할 수 없습니다.' });
      return;
    }
    this.commit(next);
  };

  openSource = (source: string) => {
    const next = this.parse(source, 'file', this.snapshot.revision + 1);
    this.past.length = this.future.length = 0;
    this.publish(next);
  };

  private updateNode(id: string, change: Partial<NodeLayout>) {
    if (this.snapshot.error) throw new Error('코드 오류를 수정한 뒤 편집하세요.');
    const current = this.valid.layout[id];
    if (!Object.hasOwn(this.valid.layout, id)) throw new Error(`없는 노드: ${id}`);
    const node = { ...current, ...change };
    const layout = { ...this.valid.layout, [id]: node };
    validateLayout(this.valid.model, layout);
    if (JSON.stringify(current) === JSON.stringify(node)) return;
    const source = writeLayoutMetadata(this.valid.source, layout);
    this.commit({ ...this.valid, layout, source, origin: 'gui', revision: this.snapshot.revision + 1 });
  }

  moveNode = (id: string, x: number, y: number) => {
    const point = this.snap?.snap({ x, y }, id, this.valid.layout) ?? { x, y };
    this.updateNode(id, { x: point.x, y: point.y, placement: 'manual' });
  };
  resizeNode = (id: string, width: number, height: number) => this.updateNode(id, { width, height });
  setNodeColor = (id: string, color: string) => this.updateNode(id, { color });
  canUndo = () => Boolean(this.snapshot.error) || this.past.length > 0;
  canRedo = () => !this.snapshot.error && this.future.length > 0;

  undo = () => {
    const previous = this.snapshot.error ? this.valid : this.past.pop();
    if (!previous) return;
    if (!this.snapshot.error) this.future.push(this.valid);
    this.publish({ ...previous, origin: 'undo', revision: this.snapshot.revision + 1 });
  };
  redo = () => {
    if (!this.canRedo()) return;
    this.past.push(this.valid);
    this.publish({ ...this.future.pop()!, origin: 'redo', revision: this.snapshot.revision + 1 });
  };
}
