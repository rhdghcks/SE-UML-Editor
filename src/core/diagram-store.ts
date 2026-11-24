import { mergeRoutes } from './manual-routes';
import type { IDiagramEditor, ILayoutEngine, IParser, ISnapStrategy } from './contracts';
import { readLayoutMetadata, writeLayoutMetadata } from './layout-metadata';
import type { ClassDiagram, EditorSnapshot, LayoutMap, NodeLayout } from './types';
import { freezeSnapshot, validateLayout, validateModel } from './validation';

export class DiagramStore implements IDiagramEditor {
  private editGroup?: symbol;
  private snapshot: EditorSnapshot;
  private valid: EditorSnapshot;
  private readonly past: EditorSnapshot[] = [];
  private readonly future: EditorSnapshot[] = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly parser: IParser, private readonly engine: ILayoutEngine,
    source: string, private readonly snap?: ISnapStrategy,
    private readonly arrange?: (model: ClassDiagram, boxes: LayoutMap, added: string[]) => Promise<LayoutMap>) {
    this.snapshot = this.parse(source, 'init', 0);
    this.valid = this.snapshot;
  }

  private parse(source: string, origin: EditorSnapshot['origin'], revision: number) {
    const { code, layout: saved } = readLayoutMetadata(source);
    const model = this.parser.parse(code);
    validateModel(model);
    if (model.kind === 'class') {
      const carry = (origin === 'code' || origin === 'gui') && this.valid.model.kind === 'class';
      source = mergeRoutes(source, carry ? this.valid.source : '', model.relations);
    }
    const previous: LayoutMap = (origin === 'code' || origin === 'gui') && model.kind === this.valid.model.kind
      ? this.valid.layout : {};
    const merged = { ...previous, ...saved };
    // 같은 문서를 편집할 때 수동 배치한 노드의 마지막 GUI 상태를 보존한다.
    for (const [id, box] of Object.entries(previous)) {
      if (box.placement === 'manual') merged[id] = box;
    }
    const layout = this.engine.layout(model, structuredClone(merged));
    if (origin === 'code' && saved && (Object.keys(saved).length !== Object.keys(layout).length ||
        Object.entries(layout).some(([id, box]) => JSON.stringify(saved[id]) !== JSON.stringify(box)))) {
      const marker = writeLayoutMetadata('', layout).trimStart();
      source = source.replace(/^[^\S\r\n]*%% @se-uml-layout [^\r\n]*/m, () => marker);
    }
    validateLayout(model, layout);
    const next = freezeSnapshot(structuredClone({ source, model, layout, error: null, origin, revision }));
    const added = Object.keys(layout).filter(id => !Object.hasOwn(merged, id));
    if (this.arrange && model.kind === 'class' && added.length) {
      const arrange = this.arrange;
      void Promise.resolve().then(async () => {
        if (this.snapshot.model !== next.model) return;
        const arranged = await arrange(model, next.layout, added);
        if (this.snapshot.model !== next.model || this.snapshot.revision !== revision) return;
        validateLayout(model, arranged);
        const current = this.snapshot;
        const updated = current.source.replace(/^[^\S\r\n]*%% @se-uml-layout [^\r\n]*/m,
          () => writeLayoutMetadata('', arranged).trimStart());
        this.publish({ ...current, layout: arranged, source: updated, revision: revision + 1 });
      }).catch(error => console.warn('클래스 자동 배치 실패. 기본 배치를 유지합니다.', error));
    }
    return next;
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

  private commit(next: EditorSnapshot, group?: symbol) {
    if (!group || group !== this.editGroup) this.past.push(this.valid);
    this.editGroup = group;
    if (this.past.length > 5) this.past.shift();
    this.future.length = 0;
    this.publish(next);
  }

  updateSource = (source: string, group?: symbol) => {
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
    this.commit(next, group);
  };

  openSource = (source: string) => {
    const next = this.parse(source, 'file', this.snapshot.revision + 1);
    this.editGroup = undefined;
    this.past.length = this.future.length = 0;
    this.publish(next);
  };

  addNode = (name: string) => {
    if (this.snapshot.error) throw new Error('코드 오류를 수정한 뒤 편집하세요.');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('영문 식별자를 입력하세요.');
    const keyword = this.valid.model.kind === 'class' ? 'class' : 'participant';
    if (Object.hasOwn(this.valid.layout, `${keyword}:${name}`)) throw new Error('이미 사용 중인 이름입니다.');
    const { code } = readLayoutMetadata(this.valid.source);
    const next = this.parse(`${code}\n  ${keyword} ${name}`, 'gui', this.snapshot.revision + 1);
    this.commit({ ...next, source: writeLayoutMetadata(next.source, next.layout) });
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
    this.editGroup = undefined;
    const previous = this.snapshot.error ? this.valid : this.past.pop();
    if (!previous) return;
    if (!this.snapshot.error) this.future.push(this.valid);
    this.publish({ ...previous, origin: 'undo', revision: this.snapshot.revision + 1 });
  };
  redo = () => {
    this.editGroup = undefined;
    if (!this.canRedo()) return;
    this.past.push(this.valid);
    this.publish({ ...this.future.pop()!, origin: 'redo', revision: this.snapshot.revision + 1 });
  };
}
