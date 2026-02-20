import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultPluginDiscoveryPath,
  readPluginBridgeDiscovery,
  writePluginBridgeDiscovery,
} from "./discovery";

describe("plugin bridge discovery", () => {
  const cleanupDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(cleanupDirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
  });

  it("writes and reads discovery payload", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-discovery-"));
    cleanupDirs.push(root);
    const path = join(root, "plugin-bridge.discovery.json");

    await writePluginBridgeDiscovery(path, {
      url: "http://127.0.0.1:4499",
      token: "secret",
      updatedAt: new Date().toISOString(),
      pid: 12345,
    });

    const found = await readPluginBridgeDiscovery(path);
    expect(found?.url).toBe("http://127.0.0.1:4499");
    expect(found?.token).toBe("secret");
    expect(found?.pid).toBe(12345);
  });

  it("returns undefined for missing or malformed discovery", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-discovery-"));
    cleanupDirs.push(root);
    const missing = join(root, "missing.json");
    const malformed = join(root, "malformed.json");

    expect(await readPluginBridgeDiscovery(missing)).toBeUndefined();

    await writeFile(malformed, "{ bad json }", "utf8");
    expect(await readPluginBridgeDiscovery(malformed)).toBeUndefined();
  });

  it("builds default discovery path from HOME", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/tmp/opencode-home";
    try {
      expect(defaultPluginDiscoveryPath()).toContain("/tmp/opencode-home/.config/opencode/bui/plugin-bridge.discovery.json");
    } finally {
      process.env.HOME = originalHome;
    }
  });
});
