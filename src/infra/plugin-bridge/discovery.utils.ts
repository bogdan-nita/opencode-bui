import { dirname, resolve } from "node:path";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { ensureDir, fileExists } from "@infra/runtime/runtime-fs.utils.js";

const discoverySchema = z.object({
  url: z.string().url(),
  token: z.string().min(1),
  updatedAt: z.string().min(1),
  pid: z.number().int().positive(),
});

export type PluginBridgeDiscovery = z.infer<typeof discoverySchema>;

export function defaultPluginDiscoveryPath(): string {
  const home = process.env.HOME || process.cwd();
  return resolve(home, ".config", "opencode", "bui", "plugin-bridge.discovery.json");
}

export async function writePluginBridgeDiscovery(path: string, input: PluginBridgeDiscovery): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  try {
    await chmod(path, 0o600);
  } catch {
    // Best effort on platforms/filesystems that do not support chmod.
  }
}

export async function readPluginBridgeDiscovery(path: string): Promise<PluginBridgeDiscovery | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return discoverySchema.parse(parsed);
  } catch {
    return undefined;
  }
}
