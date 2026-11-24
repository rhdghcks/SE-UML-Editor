import type { LayoutMap, NodeLayout } from './types';

const MARKER = '%% @se-uml-layout ';

interface StoredLayout {
  version: 1;
  nodes: LayoutMap;
}

export function isNodeLayout(value: unknown): value is NodeLayout {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) =>
    typeof item[key] === 'number' && Number.isFinite(item[key]),
  ) && Number(item.width) > 0 && Number(item.height) > 0
    && (item.placement === undefined || item.placement === 'auto' || item.placement === 'manual')
    && typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color);
}

export function readLayoutMetadata(source: string): {
  code: string;
  layout: LayoutMap | null;
} {
  let layout: LayoutMap | null = null;
  let code = source;

  for (const line of source.split(/\r?\n/)) {
    if (!line.trim().startsWith(MARKER)) {

      continue;
    }

    if (layout !== null) throw new Error('배치 메타데이터는 한 번만 작성할 수 있습니다.');

    let parsed: unknown;
    try {
      parsed = JSON.parse(line.trim().slice(MARKER.length));
    } catch {
      throw new Error('배치 메타데이터의 JSON 형식이 올바르지 않습니다.');
    }

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('배치 메타데이터 형식이 올바르지 않습니다.');
    }
    const stored = parsed as Partial<StoredLayout>;
    if (stored.version !== 1 || !stored.nodes || typeof stored.nodes !== 'object'
      || Array.isArray(stored.nodes)) {
      throw new Error('지원하지 않는 배치 메타데이터 버전입니다.');
    }
    if (!Object.values(stored.nodes).every(isNodeLayout)) {
      throw new Error('배치 메타데이터에 잘못된 노드 좌표가 있습니다.');
    }
    layout = stored.nodes;
    // 작성기가 추가한 구분 개행만 제거해 원문의 CRLF와 끝 공백을 보존한다.
    code = source.replace(/(?:\r?\n)?^[^\S\r\n]*%% @se-uml-layout [^\r\n]*/m, '');
  }
  return { code, layout };
}

export function writeLayoutMetadata(source: string, layout: LayoutMap): string {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout) || !Object.values(layout).every(isNodeLayout)) {
    throw new TypeError('저장할 배치에 잘못된 노드 좌표가 있습니다.');
  }
  const { code } = readLayoutMetadata(source);
  const nodes: LayoutMap = Object.create(null);
  for (const id of Object.keys(layout).sort()) nodes[id] = layout[id];
  return `${code}\n${MARKER}${JSON.stringify({ version: 1, nodes })}`;
}
