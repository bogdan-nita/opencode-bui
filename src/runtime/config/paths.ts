import { basename, dirname, resolve } from "node:path";
import { fileExists } from "@runtime/runtime-fs";
import { BUI_CONFIG_FILES } from "./config.consts";
import type { ConfigDiscovery } from "./config.types";

const pathExists = fileExists;

export function homeDir(): string {
  return process.env.HOME ?? process.cwd();
}

export async function findNearestOpencodeDir(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const nestedConfig = resolve(current, ".opencode", "opencode.json");
    if (await pathExists(nestedConfig)) {
      return resolve(current, ".opencode");
    }

    const directConfig = resolve(current, "opencode.json");
    if (await pathExists(directConfig)) {
      return current;
    }

    const nestedDir = resolve(current, ".opencode");
    if (await pathExists(nestedDir)) {
      return nestedDir;
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function findNearestOpencodeConfig(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    const nested = resolve(current, ".opencode", "opencode.json");
    if (await pathExists(nested)) {
      return nested;
    }
    const direct = resolve(current, "opencode.json");
    if (await pathExists(direct)) {
      return direct;
    }
    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function findNearestBuiConfig(startDir = process.cwd()): Promise<string | undefined> {
  let current = resolve(startDir);
  while (true) {
    for (const name of BUI_CONFIG_FILES) {
      const nestedOpencodeBui = resolve(current, ".opencode", "bui", name);
      if (await pathExists(nestedOpencodeBui)) {
        return nestedOpencodeBui;
      }

      const nestedBui = resolve(current, "bui", name);
      if (await pathExists(nestedBui)) {
        return nestedBui;
      }

      const direct = resolve(current, name);
      if (await pathExists(direct)) {
        return direct;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export async function discoverConfigContext(startDir = process.cwd()): Promise<ConfigDiscovery> {
  const nearestOpencodeDir = await findNearestOpencodeDir(startDir);
  const nearestOpencodeConfig = await findNearestOpencodeConfig(startDir);
  const nearestBuiConfigCandidate = await findNearestBuiConfig(startDir);
  if (!nearestOpencodeDir && !nearestOpencodeConfig && !nearestBuiConfigCandidate) {
    return {};
  }

  const resolvedOpencodeDir = nearestOpencodeDir ?? (nearestOpencodeConfig ? dirname(nearestOpencodeConfig) : undefined);
  const nearestBuiConfig =
    resolvedOpencodeDir && basename(resolvedOpencodeDir) === ".opencode" && nearestBuiConfigCandidate
      ? nearestBuiConfigCandidate.startsWith(`${resolvedOpencodeDir}/`)
        ? nearestBuiConfigCandidate
        : undefined
      : nearestBuiConfigCandidate;
  const resolvedBuiDir = nearestBuiConfig
    ? dirname(nearestBuiConfig)
    : resolvedOpencodeDir
      ? basename(resolvedOpencodeDir) === ".opencode"
        ? resolve(resolvedOpencodeDir, "bui")
        : resolvedOpencodeDir
      : undefined;

  return {
    ...(nearestOpencodeConfig ? { nearestOpencodeConfig } : {}),
    ...(resolvedOpencodeDir ? { nearestOpencodeDir: resolvedOpencodeDir } : {}),
    ...(nearestBuiConfig ? { nearestBuiConfig } : {}),
    ...(resolvedBuiDir ? { nearestBuiDir: resolvedBuiDir } : {}),
  };
}

export async function resolveDefaultDbDir(discovery: ConfigDiscovery): Promise<string | undefined> {
  const localCandidate = discovery.nearestOpencodeDir
    ? basename(discovery.nearestOpencodeDir) === ".opencode"
      ? resolve(discovery.nearestOpencodeDir, "bui")
      : discovery.nearestOpencodeDir
    : undefined;

  if (localCandidate) {
    const localDbPath = resolve(localCandidate, "opencode-bui.db");
    if (await pathExists(localDbPath)) {
      return localCandidate;
    }
  }

  const globalBuiDir = resolve(homeDir(), ".config", "opencode", "bui");
  const globalDbPath = resolve(globalBuiDir, "opencode-bui.db");
  if (await pathExists(globalDbPath)) {
    return globalBuiDir;
  }

  return globalBuiDir;
}
