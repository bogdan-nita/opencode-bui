import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";

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

export async function readPluginBridgeDiscovery(path: string): Promise<PluginBridgeDiscovery | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return discoverySchema.parse(parsed);
  } catch {
    return undefined;
  }
}
