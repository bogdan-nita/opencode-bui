import { dirname } from "node:path";
import { ensureDir, readTextFile, writeTextFile } from "@infra/runtime/runtime-fs";

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readTextFile(filePath);
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDir(dirname(filePath));
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
