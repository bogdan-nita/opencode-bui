import type { LockHandle, LockService } from "@runtime/bridge/types";
import { tryAcquireLock } from "@runtime/lock";

export function createFileLockService(): LockService {
  return {
    async acquire(path: string): Promise<LockHandle> {
      const lock = await tryAcquireLock(path);
      if (!lock.acquired || !lock.release) {
        throw new Error(`Could not acquire lock: ${lock.holder || "unknown"}`);
      }
      return {
        release: lock.release,
      };
    },
  };
}
