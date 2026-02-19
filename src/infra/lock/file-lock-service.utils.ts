import type { LockHandle, LockService } from "../../core/ports/lock-service.types.js";
import { tryAcquireLock } from "../../core/lock.js";

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
