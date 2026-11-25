import type { BendPoint } from './manual-routes';
import { readRoutes, readSequenceOffsets } from './manual-routes';

const marker = '%% @se-uml-route ';

/** Changes only the matching dedicated comment; preserves all other source bytes. */
export function writeRoute(source: string, key: string, points: BendPoint[]): string {
  if (typeof key !== 'string' || !key || !Array.isArray(points) || !points.every(point => point &&
      Number.isFinite(point.x) && Number.isFinite(point.y))) {
    throw new TypeError('간선 경로의 키와 좌표가 올바르지 않습니다.');
  }
  const previous = readRoutes(source);
  if (JSON.stringify(previous.get(key)) === JSON.stringify(points)) return source;
  return upsert(source, key, points, readSequenceOffsets(source).get(key));
}

export function writeSequenceOffset(source: string, key: string, offsetY: number): string {
  if (typeof key !== 'string' || !key || !Number.isFinite(offsetY)) {
    throw new TypeError('시퀀스 화살표의 키와 높이가 올바르지 않습니다.');
  }
  const previous = readRoutes(source);
  if (readSequenceOffsets(source).get(key) === offsetY) return source;
  return upsert(source, key, previous.get(key) ?? [], offsetY);
}

function upsert(source: string, key: string, points: BendPoint[], offsetY?: number): string {
  const comment = marker + JSON.stringify({ key, points: points.map(({ x, y }) => ({ x, y })), offsetY });
  let replaced = false;
  const updated = source.replace(/^[^\S\r\n]*%% @se-uml-route [^\r\n]*/gm, line => {
    const data: unknown = JSON.parse(line.trimStart().slice(marker.length));
    if (typeof data === 'object' && data !== null && 'key' in data && data.key === key) {
      replaced = true;
      return comment;
    }
    return line;
  });
  return replaced ? updated : source + (source.includes('\r\n') ? '\r\n' : '\n') + comment;
}
