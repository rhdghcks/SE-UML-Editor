import { expect, it } from 'vitest';
import { readLayoutMetadata, writeLayoutMetadata } from './layout-metadata';
import type { LayoutMap } from './types';

const layout: LayoutMap = { 'class:A': { x: 10, y: 20, width: 190, height: 112, color: '#ffffff', placement: 'manual' } };
it('round-trips Korean, CRLF and trailing spaces without accumulating comments', () => {
  const source = 'classDiagram\r\n%% 사용자 메모\r\nclass A  \r\n';
  const once = writeLayoutMetadata(source, layout);
  const twice = writeLayoutMetadata(once, layout);
  expect(twice).toBe(once);
  expect(readLayoutMetadata(twice)).toEqual({ code: source, layout });
});
it.each([0, -1, Infinity, NaN])('rejects invalid size %s before producing unreadable output', width => {
  expect(() => writeLayoutMetadata('classDiagram\nclass A', { 'class:A': { ...layout['class:A'], width } })).toThrow();
});
it('rejects duplicate markers and accepts legacy placement omission', () => {
  const legacy = { ...layout['class:A'] }; delete legacy.placement;
  const source = writeLayoutMetadata('classDiagram\nclass A', { 'class:A': legacy });
  expect(readLayoutMetadata(source).layout?.['class:A']).toEqual(legacy);
  expect(() => readLayoutMetadata(source + '\n%% @se-uml-layout {"version":1,"nodes":{}}')).toThrow();
});
