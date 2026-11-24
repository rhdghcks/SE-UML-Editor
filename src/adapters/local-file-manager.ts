import type { IFileManager } from '../core/contracts';
import { downloadBlob, pickSaveFile, writeFile, type SaveFileHandle } from './download-blob';

const FILENAME = 'diagram.mmd';

export class LocalFileManager implements IFileManager {
  private handle?: SaveFileHandle;
  private generation = 0;

  read(file: Blob) { return file.text(); }

  /**
   * 처음 저장이면 OS 저장 창을 띄우고, 그다음부터는 같은 파일에 쓴다.
   * 저장 창이 없는 브라우저는 다운로드를 요청한다. 사용자가 저장 창을 닫으면 AbortError로 reject한다.
   * 쓰기에 실패한 파일(삭제·이동·권한 회수)은 잊어서 다음 저장에서 저장 창을 다시 띄운다.
   */
  async write(source: string) {
    const generation = this.generation;
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const handle = this.handle ?? await pickSaveFile(FILENAME);
    if (!handle) {
      downloadBlob(blob, FILENAME);
      return;
    }
    try {
      await writeFile(handle, blob);
    } catch (error) {
      if (this.handle === handle) this.handle = undefined;
      throw error;
    }
    if (generation === this.generation) this.handle = handle;
  }

  /** 다른 문서를 열었을 때 부른다. 다음 저장은 다시 저장 창을 띄운다. */
  reset() {
    this.handle = undefined;
    this.generation++;
  }
}
