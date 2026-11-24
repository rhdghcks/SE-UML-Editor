import type { ClassRelation } from './types';

const marker = '%% @se-uml-route ';
export interface BendPoint { x: number; y: number }
export type ManualRoutes = Map<string, BendPoint[]>;

// 관계 배열 전체의 순번 대신 같은 양 끝점·종류 안의 순번을 사용한다.
export function routeKeys(relations: ClassRelation[]) {
  const counts = new Map<string, number>();
  return relations.map(edge => {
    const tuple = [edge.from, edge.connector, edge.to];
    const family = JSON.stringify(tuple);
    const index = counts.get(family) ?? 0;
    counts.set(family, index + 1);
    return JSON.stringify([...tuple, index]);
  });
}

export function readRoutes(source: string): ManualRoutes {
  const routes: ManualRoutes = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line.trimStart().startsWith(marker)) continue;
    const data = JSON.parse(line.trimStart().slice(marker.length));
    if (!data || typeof data.key !== 'string' || routes.has(data.key) ||
        !Array.isArray(data.points) || !data.points.every((p: BendPoint) =>
          p && Number.isFinite(p.x) && Number.isFinite(p.y))) {
      throw new Error('간선 경로 주석의 키 또는 좌표가 올바르지 않습니다.');
    }
    routes.set(data.key, data.points);
  }
  return routes;
}

export function mergeRoutes(source: string, previous: string, relations: ClassRelation[]) {
  const incoming = readRoutes(source);
  const prior = readRoutes(previous);
  for (const key of routeKeys(relations)) {
    if (!incoming.has(key) && prior.has(key)) {
      source += '\n' + marker + JSON.stringify({ key, points: prior.get(key) });
    }
  }
  return source;
}
