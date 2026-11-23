/** Integer set with O(1) add/remove/random pick (swap-remove into a dense array). */
export class IndexedSet {
  private readonly items: number[] = [];
  private readonly index = new Map<number, number>();

  get size(): number {
    return this.items.length;
  }

  has(v: number): boolean {
    return this.index.has(v);
  }

  add(v: number): void {
    if (this.index.has(v)) return;
    this.index.set(v, this.items.length);
    this.items.push(v);
  }

  delete(v: number): void {
    const i = this.index.get(v);
    if (i === undefined) return;
    const last = this.items.pop()!;
    if (i < this.items.length) {
      this.items[i] = last;
      this.index.set(last, i);
    }
    this.index.delete(v);
  }

  /** Random element using the given RNG in [0,1). */
  pick(rand: () => number): number | undefined {
    if (this.items.length === 0) return undefined;
    return this.items[Math.floor(rand() * this.items.length)];
  }

  values(): readonly number[] {
    return this.items;
  }

  clear(): void {
    this.items.length = 0;
    this.index.clear();
  }
}
