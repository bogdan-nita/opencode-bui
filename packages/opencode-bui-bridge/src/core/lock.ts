import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export async function tryAcquireLock(path: string): Promise<{
  acquired: boolean;
  holder?: string;
  release?: () => Promise<void>;
}> {
  await mkdir(dirname(path), { recursive: true });

  const acquireFresh = async () => {
    const handle = await open(path, "wx");
    const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2);
    await handle.writeFile(`${payload}\n`, "utf8");

    const release = async () => {
      try {
        await handle.close();
      } catch {
        // no-op
      }
      try {
        await unlink(path);
      } catch {
        // no-op
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
      const holder = (await readFile(path, "utf8")).trim();
      try {
        const parsed = JSON.parse(holder) as { pid?: number };
        if (typeof parsed.pid === "number") {
          try {
            process.kill(parsed.pid, 0);
          } catch {
            await unlink(path);
            return await acquireFresh();
          }
        }
      } catch {
        // no-op
      }
      return { acquired: false, holder };
    } catch {
      return { acquired: false, holder: "lock held by another process" };
    }
  }
}
