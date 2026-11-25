import type { IFileManager } from '../core/contracts';
import { downloadBlob, pickSaveFile, writeFile } from './download-blob';

/** n번째 저장의 파일 이름. 0 → diagram.mmd, 1 → diagram(1).mmd, 2 → diagram(2).mmd … */
export function versionedName(n: number) {
  return n === 0 ? 'diagram.mmd' : `diagram(${n}).mmd`;
}

export class LocalFileManager implements IFileManager {
  /** 이번 실행에서 저장에 성공한 횟수. 다음 저장 이름의 번호가 된다. */
  private saved = 0;

  read(file: Blob) { return file.text(); }

  /**
   * 저장할 때마다 새 파일로 저장한다. 이전에 저장한 파일을 덮어쓰지 않는다.
   * OS 저장 창에 diagram.mmd, diagram(1).mmd, diagram(2).mmd … 순서로 이름을 미리 채운다.
   * 저장 창이 없는 브라우저는 같은 이름으로 다운로드를 요청한다.
   * 사용자가 저장 창을 닫거나(AbortError) 쓰기에 실패하면 번호를 올리지 않아, 다음 저장이 같은 이름을 다시 제안한다.
   * 번호는 다른 문서를 열어도 처음으로 돌아가지 않는다. 앞서 저장한 파일 이름을 다시 제안하지 않기 위해서다.
   */
  async write(source: string) {
    const filename = versionedName(this.saved);
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const handle = await pickSaveFile(filename);
    if (handle) await writeFile(handle, blob);
    else downloadBlob(blob, filename);
    this.saved++;
  }
}
