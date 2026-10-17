/**
 * In-process async mutex keyed by package (folder id). Snapshot capture plus evaluation, and human
 * response processing, run one at a time per package (Codex finding 6), so freshness checked inside
 * the lock cannot be invalidated by a concurrent capture. Cached on globalThis to survive hot reload.
 *
 * Acquisition is bounded (Codex NEW-2): a waiter gives up after `timeoutMs` (KEEL_LOCK_TIMEOUT_MS,
 * default 60 s) with LockTimeoutError. A holder keeps ownership until its own operation settles, so a
 * cancelled operation can never land side effects after the lock was handed on.
 */
const G = globalThis as unknown as { __keelLocks?: Map<string, Promise<unknown>> };
const locks = (G.__keelLocks ??= new Map());

export class LockTimeoutError extends Error {
  readonly code = "PACKAGE_BUSY";
  constructor(key: string, ms: number) {
    super(`package ${key} is busy: another review transaction held it for more than ${ms} ms; try again`);
  }
}

export const DEFAULT_LOCK_TIMEOUT_MS = Number(process.env.KEEL_LOCK_TIMEOUT_MS ?? 60_000);

export async function withPackageLock<T>(key: string, fn: () => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  const prev = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  // The next waiter needs both the previous holder and this slot to finish.
  const chained = prev.catch(() => undefined).then(() => mine);
  locks.set(key, chained);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const acquired = await Promise.race([
    prev.catch(() => undefined).then(() => true),
    new Promise<false>((r) => (timer = setTimeout(() => r(false), timeoutMs))),
  ]);
  clearTimeout(timer);
  if (!acquired) {
    release(); // give up our slot; ownership still passes only after the previous holder settles
    if (locks.get(key) === chained) locks.delete(key);
    throw new LockTimeoutError(key, timeoutMs);
  }
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
