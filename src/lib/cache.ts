// Small in-memory TTL cache for AI answers: repeated checks of the same area are instant and save API quota.
export function ttlCache<V>(ttlMs: number, maxEntries = 500) {
  const store = new Map<string, { value: V; expires: number }>();
  return {
    get(key: string): V | undefined {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (hit.expires < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key: string, value: V) {
      if (store.size >= maxEntries) store.delete(store.keys().next().value!);
      store.set(key, { value, expires: Date.now() + ttlMs });
    },
  };
}
