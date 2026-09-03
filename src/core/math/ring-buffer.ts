/**
 * Fixed-capacity ring buffer. Pushing past `capacity` overwrites the oldest
 * entry in place (O(1) push, no reallocation).
 */
export class RingBuffer<T> {
  readonly capacity: number;

  private readonly items: (T | undefined)[];
  /** Index the next `push` will write to. */
  private head = 0;
  private count = 0;

  constructor(capacity: number) {
    if (capacity < 1) {
      throw new RangeError("RingBuffer capacity must be at least 1");
    }
    this.capacity = capacity;
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    this.items[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
  }

  /** Index of the oldest surviving item within the backing array. */
  private oldestIndex(): number {
    return this.count < this.capacity ? 0 : this.head;
  }

  /**
   * Visits items oldest to newest. `ageFraction` is 0 for the oldest and 1
   * for the newest surviving item (a single item gets ageFraction 1).
   * `index` is the 0-based position in oldest-to-newest order.
   */
  forEach(fn: (item: T, ageFraction: number, index: number) => void): void {
    const start = this.oldestIndex();
    const denominator = this.count > 1 ? this.count - 1 : 1;
    for (let k = 0; k < this.count; k++) {
      const idx = (start + k) % this.capacity;
      const item = this.items[idx] as T;
      const ageFraction = this.count === 1 ? 1 : k / denominator;
      fn(item, ageFraction, k);
    }
  }

  toArray(): T[] {
    const out: T[] = [];
    this.forEach((item) => out.push(item));
    return out;
  }

  last(): T | undefined {
    if (this.count === 0) return undefined;
    const idx = (this.head - 1 + this.capacity) % this.capacity;
    return this.items[idx];
  }
}
