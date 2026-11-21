import type { IFileManager } from '../core/contracts';

export class LocalFileManager implements IFileManager {
  read(file: Blob) { return file.text(); }

  async write(source: string) {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/plain;charset=utf-8' }));
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = 'diagram.mmd';
      link.click();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
}
