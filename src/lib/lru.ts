/**
 * Кэш с пределом: при переполнении вытесняется запись, к которой дольше всего не обращались (LRU).
 * Порядок обращений хранит сам Map — get и set переносят ключ в конец.
 */
export class Lru<K, V> {
  private readonly map = new Map<K, V>();

  constructor(readonly limit: number) {
    if (!(limit >= 1)) throw new Error("Lru: limit must be ≥ 1");
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.limit) this.map.delete(this.map.keys().next().value!);
    return this;
  }

  has(key: K) {
    return this.map.has(key);
  }

  delete(key: K) {
    return this.map.delete(key);
  }

  keys() {
    return this.map.keys();
  }

  get size() {
    return this.map.size;
  }
}
