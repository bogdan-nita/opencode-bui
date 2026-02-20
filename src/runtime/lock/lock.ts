import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function tryAcquireLock(lockFilePath: string): Promise<{
  acquired: boolean;
  holder?: string;
  release?: () => Promise<void>;
}> {
  await mkdir(dirname(lockFilePath), { recursive: true });

  const acquireFresh = async () => {
    const handle = await open(lockFilePath, "wx");
    const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2);
    await handle.writeFile(`${payload}\n`, "utf8");

    const release = async () => {
      try {
        await handle.close();
      } catch {
        // Already closed - ignore
      }
      try {
        await unlink(lockFilePath);
      } catch {
        // Already deleted - ignore
      }
    };

    return { acquired: true as const, release };
  };

  try {
    return await acquireFresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("EEXIST")) {
      return { acquired: false, holder: message };
    }

      try {
        const holder = (await readFile(lockFilePath, "utf8")).trim();
        try {
          const parsed = JSON.parse(holder) as { pid?: number };
          if (typeof parsed.pid === "number") {
            try {
              process.kill(parsed.pid, 0);
            } catch {
              // Process no longer running - stale lock, remove it
              await unlink(lockFilePath);
              return await acquireFresh();
            }
          }
        } catch {
          // Not valid JSON - use raw content as holder identifier
        }
        return { acquired: false, holder };
      } catch {
        // Lock file unreadable - return generic message
        return { acquired: false, holder: "lock held by another process" };
      }
  }
}
