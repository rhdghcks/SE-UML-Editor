// File System Access API의 저장 창. Chromium 계열에만 있고 TypeScript DOM 타입에는 아직 없어서 필요한 만큼만 선언한다.
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

export interface SaveFileHandle {
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }>;
}

declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<SaveFileHandle>;
  }
}

const FILE_TYPES: Record<string, { description: string; accept: Record<string, string[]> }> = {
  mmd: { description: 'Mermaid 작업 파일', accept: { 'text/plain': ['.mmd'] } },
  png: { description: 'PNG 이미지', accept: { 'image/png': ['.png'] } },
  jpg: { description: 'JPG 이미지', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
};

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

/**
 * OS 저장 창을 띄워 저장할 파일을 고르게 한다.
 * 저장 창을 지원하지 않는 브라우저면 undefined를 돌려준다. 사용자가 창을 닫으면 AbortError로 reject한다.
 * 사용자 클릭 직후에만 열 수 있으므로, 시간이 걸리는 작업보다 먼저 호출해야 한다.
 */
export async function pickSaveFile(filename: string): Promise<SaveFileHandle | undefined> {
  if (typeof window.showSaveFilePicker !== 'function') return undefined;
  const type = FILE_TYPES[filename.split('.').pop() ?? ''];
  return window.showSaveFilePicker({ suggestedName: filename, ...(type ? { types: [type] } : {}) });
}

export async function writeFile(handle: SaveFileHandle, blob: Blob) {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

// 브라우저에 Blob 다운로드를 요청한다. 저장 위치 선택은 브라우저 설정을 따른다.
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * 저장 창에서 위치를 고른 뒤 produce()가 만든 Blob을 저장한다. 저장 창이 없으면 다운로드로 대체한다.
 * 저장 창을 먼저 띄우는 이유: 이미지 생성을 기다리는 사이 클릭의 사용자 활성화가 끝나면 저장 창이 거부된다.
 * 사용자가 창을 닫으면 produce()를 부르지 않고 AbortError로 reject한다.
 * 제약: Chromium은 저장 창에서 고른 파일을 그 자리에서 만들거나 비울 수 있다. 위치를 고른 뒤 produce()가
 * 실패하거나 취소되면 빈 파일이 남을 수 있다. 브라우저 API로는 이 파일을 지울 수 없다.
 */
export async function saveBlob(filename: string, produce: () => Promise<Blob>) {
  const handle = await pickSaveFile(filename);
  const blob = await produce();
  if (handle) await writeFile(handle, blob);
  else downloadBlob(blob, filename);
}
