/**
 * In-process async mutex keyed by package (folder id). Snapshot capture plus evaluation, and human
 * response processing, run one at a time per package (Codex finding 6), so freshness checked inside
 * the lock cannot be invalidated by a concurrent capture. Cached on globalThis to survive hot reload.
 */
const G = globalThis as unknown as { __keelLocks?: Map<string, Promise<unknown>> };
const locks = (G.__keelLocks ??= new Map());

export async function withPackageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => mine);
  locks.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}

/** True while some holder or waiter exists for the key (tests and diagnostics). */
export function isLocked(key: string): boolean {
  return locks.has(key);
}
