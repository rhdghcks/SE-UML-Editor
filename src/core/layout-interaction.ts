/** Keep background layout results from replacing the document during a pointer gesture. */
export class LayoutInteraction {
  private active = 0;
  private readonly waiters = new Set<() => void>();

  begin(): () => void {
    this.active++;
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.active--;
      if (this.active === 0) {
        const waiting = [...this.waiters];
        this.waiters.clear();
        for (const resolve of waiting) resolve();
      }
    };
  }

  async complete<T>(work: Promise<T>): Promise<T> {
    const result = await work;
    while (this.active > 0) await new Promise<void>(resolve => this.waiters.add(resolve));
    return result;
  }
}
