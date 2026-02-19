import { basename, resolve } from "node:path";
import type { BridgeCommandDescriptor } from "@core/ports/bridge-adapter.types.js";
import type { ConfigDiscovery } from "@infra/config/config.types.js";
import { fileExists, readDir } from "@infra/runtime/runtime-fs.utils.js";
import { logger } from "@infra/runtime/logger.utils.js";

function normalizeCommandName(input: string): string | undefined {
  const raw = input.trim().toLowerCase().replaceAll("-", "_");
  if (!raw) {
    return undefined;
  }

  const cleaned = raw.replace(/[^a-z0-9_]/g, "");
  if (!cleaned) {
    return undefined;
  }
  return cleaned.slice(0, 32);
}

function toDescriptor(command: string): BridgeCommandDescriptor {
  return {
    command,
    description: `Run OpenCode /${command}`,
  };
}

function commandDirsFromDiscovery(discovery: ConfigDiscovery): string[] {
  const candidates = [
    discovery.nearestOpencodeDir ? resolve(discovery.nearestOpencodeDir, "commands") : undefined,
    discovery.nearestOpencodeDir ? resolve(discovery.nearestOpencodeDir, ".opencode", "commands") : undefined,
  ].filter((value): value is string => Boolean(value));

  return [...new Set(candidates)];
}

export async function discoverOpencodeCommands(discovery: ConfigDiscovery): Promise<BridgeCommandDescriptor[]> {
  const dirs = commandDirsFromDiscovery(discovery);
  const discovered: BridgeCommandDescriptor[] = [];
  const seen = new Set<string>();
  const sourceByCommand = new Map<string, string>();

  for (const dir of dirs) {
    if (!(await fileExists(dir))) {
      continue;
    }

    const entries = await readDir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) {
        continue;
      }
      const fileName = basename(entry, ".md");
      const command = normalizeCommandName(fileName);
      if (!command) {
        continue;
      }
      const source = resolve(dir, entry);
      if (seen.has(command)) {
        const existingSource = sourceByCommand.get(command) || "unknown";
        if (existingSource !== source) {
          logger.warn(
            `[bui] OpenCode command name collision: '${command}' from '${source}' conflicts with '${existingSource}'. Keeping first match.`,
          );
        }
        continue;
      }
      seen.add(command);
      sourceByCommand.set(command, source);
      discovered.push(toDescriptor(command));
    }
  }

  return discovered;
}

export function mergeBridgeCommands(base: BridgeCommandDescriptor[], discovered: BridgeCommandDescriptor[]): BridgeCommandDescriptor[] {
  const seen = new Set<string>();
  const merged: BridgeCommandDescriptor[] = [];

  for (const command of [...base, ...discovered]) {
    if (seen.has(command.command)) {
      continue;
    }
    seen.add(command.command);
    merged.push(command);
  }

  return merged;
}
