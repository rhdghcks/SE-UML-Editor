import { vi } from 'vitest';
import type { SaveFileHandle } from '../../../src/adapters/download-blob';

/**
 * jsdom에는 File System Access API가 없다. window.showSaveFilePicker를 메모리에 쓰는 가짜로 바꾼다.
 * 실제 OS 저장 창은 자동화할 수 없어 시스템 테스트는 다운로드 경로만 검증한다.
 */
export function fakeSavePicker() {
  const written: Blob[] = [];
  const writable = {
    write: vi.fn(async (data: Blob) => { written.push(data); }),
    close: vi.fn(async () => {}),
    abort: vi.fn(async () => {}),
  };
  const handle: SaveFileHandle = { createWritable: vi.fn(async () => writable) };
  const show = vi.fn(async () => handle);
  window.showSaveFilePicker = show;
  return { show, handle, writable, written };
}
