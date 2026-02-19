import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertBridgeConfigured,
  buildRuntimeConfig,
  discoverConfigContext,
  findNearestBuiConfig,
  readRuntimeConfig,
  resetRuntimeConfigCache,
  resolvePaths,
} from "../packages/opencode-bui-bridge/src/core/config.js";

describe("config", () => {
  let tempDir = "";
  let originalTelegramToken: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "opencode-bui-config-"));
    originalTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
  });

  afterEach(async () => {
    resetRuntimeConfigCache();
    if (originalTelegramToken === undefined) {
      delete process.env.TELEGRAM_BOT_TOKEN;
    } else {
      process.env.TELEGRAM_BOT_TOKEN = originalTelegramToken;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves default runtime paths", () => {
    const paths = resolvePaths({});
    expect(paths.runtimeDir).toContain(".config/opencode/bui");
    expect(paths.dbPath).toContain("opencode-bui.db");
  });

  it("builds runtime config with bridge options", () => {
    const cfg = buildRuntimeConfig({
      bridges: {
        telegram: {
          enabled: true,
          token: "token",
          allowedUserIds: [1, 2],
          allowedUsers: ["@alice", "3"],
          sttCommand: "whisper",
          sttTimeoutMs: 180000,
          backlogStaleSeconds: 20,
          backlogBatchWindowMs: 1000,
        },
        discord: {
          enabled: false,
          token: "",
          applicationId: "",
        },
      },
    });

    expect(cfg.bridges.telegram.allowedUsers.ids.has(1)).toBe(true);
    expect(cfg.bridges.telegram.allowedUsers.ids.has(3)).toBe(true);
    expect(cfg.bridges.telegram.allowedUsers.usernames.has("alice")).toBe(true);
    expect(cfg.bridges.telegram.sttTimeoutMs).toBe(180000);
    expect(cfg.bridges.telegram.backlogStaleSeconds).toBe(20);
  });

  it("detects nearest opencode config and defaults bui context", async () => {
    const projectDir = join(tempDir, "repo", "feature", "nested");
    const opencodeDir = join(tempDir, "repo");
    await mkdir(projectDir, { recursive: true });
    await writeFile(join(opencodeDir, "opencode.json"), "{}\n", "utf8");

    const found = await discoverConfigContext(projectDir);
    expect(found.nearestOpencodeDir).toBe(opencodeDir);
    expect(found.nearestBuiDir).toBe(opencodeDir);
  });

  it("prefers .opencode directory as project root", async () => {
    const projectDir = join(tempDir, "repo", "nested");
    const opencodeDir = join(tempDir, "repo", ".opencode");
    await mkdir(projectDir, { recursive: true });
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(join(opencodeDir, "opencode.json"), "{}\n", "utf8");

    const found = await discoverConfigContext(projectDir);
    expect(found.nearestOpencodeDir).toBe(opencodeDir);
  });

  it("prefers root opencode.json over bare .opencode directory", async () => {
    const projectRoot = join(tempDir, "repo");
    const nested = join(projectRoot, "packages", "feature");
    await mkdir(nested, { recursive: true });
    await mkdir(join(projectRoot, ".opencode"), { recursive: true });
    await writeFile(join(projectRoot, "opencode.json"), "{}\n", "utf8");

    const found = await discoverConfigContext(nested);
    expect(found.nearestOpencodeDir).toBe(projectRoot);
  });

  it("finds nearest bui config when starting from nested directory", async () => {
    const projectRoot = join(tempDir, "repo");
    const nested = join(projectRoot, "packages", "feature");
    const buiDir = join(projectRoot, ".opencode", "bui");
    await mkdir(nested, { recursive: true });
    await mkdir(buiDir, { recursive: true });
    await writeFile(join(buiDir, "opencode-bui.config.ts"), "export default {}\n", "utf8");

    const found = await findNearestBuiConfig(nested);
    expect(found).toBe(join(buiDir, "opencode-bui.config.ts"));
  });

  it("returns friendly error for malformed config", async () => {
    const badConfig = join(tempDir, "opencode-bui.config.json");
    await writeFile(
      badConfig,
      JSON.stringify({ bridges: { telegram: { backlogStaleSeconds: "nope" } } }, null, 2),
      "utf8",
    );

    await expect(readRuntimeConfig({ fresh: true, cwd: tempDir, loadEnvFiles: false })).rejects.toThrow(
      /Malformed OpenCode BUI config/,
    );
  });

  it("uses local db next to opencode.json when present", async () => {
    const opencodeDir = join(tempDir, "repo");
    await mkdir(opencodeDir, { recursive: true });
    await writeFile(join(opencodeDir, "opencode.json"), "{}\n", "utf8");
    await writeFile(join(opencodeDir, "opencode-bui.db"), "", "utf8");

    const cfg = await readRuntimeConfig({ fresh: true, cwd: opencodeDir, loadEnvFiles: false });
    expect(cfg.paths.dbPath).toBe(join(opencodeDir, "opencode-bui.db"));
  });

  it("keeps db path under .opencode/bui when root config exists", async () => {
    const projectRoot = join(tempDir, "repo");
    const opencodeDir = join(projectRoot, ".opencode");
    const buiDir = join(opencodeDir, "bui");
    await mkdir(buiDir, { recursive: true });
    await writeFile(join(projectRoot, "opencode-bui.config.ts"), "export default { bridges: { telegram: { enabled: false } } }\n", "utf8");
    await writeFile(join(opencodeDir, "opencode.json"), "{}\n", "utf8");
    await writeFile(join(buiDir, "opencode-bui.db"), "", "utf8");

    const cfg = await readRuntimeConfig({ fresh: true, cwd: projectRoot, loadEnvFiles: false });
    expect(cfg.paths.dbPath).toBe(join(buiDir, "opencode-bui.db"));
  });

  it("falls back to global db when local context db is missing", async () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tempDir;

      const projectRoot = join(tempDir, "repo");
      await mkdir(projectRoot, { recursive: true });
      await writeFile(join(projectRoot, "opencode.json"), "{}\n", "utf8");

      const globalBuiDir = join(tempDir, ".config", "opencode", "bui");
      await mkdir(globalBuiDir, { recursive: true });
      await writeFile(join(globalBuiDir, "opencode-bui.db"), "", "utf8");

      const cfg = await readRuntimeConfig({ fresh: true, cwd: projectRoot, loadEnvFiles: false });
      expect(cfg.paths.dbPath).toBe(join(globalBuiDir, "opencode-bui.db"));
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("uses global db path when no local or global db exists", async () => {
    const originalHome = process.env.HOME;
    try {
      process.env.HOME = tempDir;

      const projectRoot = join(tempDir, "repo");
      await mkdir(projectRoot, { recursive: true });
      await writeFile(join(projectRoot, "opencode.json"), "{}\n", "utf8");

      const cfg = await readRuntimeConfig({ fresh: true, cwd: projectRoot, loadEnvFiles: false });
      expect(cfg.paths.dbPath).toBe(join(tempDir, ".config", "opencode", "bui", "opencode-bui.db"));
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("throws proper error for non configured bridge", () => {
    const cfg = buildRuntimeConfig({
      bridges: {
        telegram: {
          enabled: true,
          token: "token",
          allowedUserIds: [],
          sttCommand: "",
          sttTimeoutMs: 120000,
          backlogStaleSeconds: 45,
          backlogBatchWindowMs: 1200,
        },
        discord: {
          enabled: false,
          token: "",
          applicationId: "",
        },
      },
    });

    const invalidTelegram = {
      ...cfg,
      bridges: {
        ...cfg.bridges,
        telegram: {
          ...cfg.bridges.telegram,
          token: "",
        },
      },
    };

    expect(() => assertBridgeConfigured(invalidTelegram, "telegram")).toThrow(/token is missing/);
    expect(() => assertBridgeConfigured(cfg, "discord")).toThrow(/disabled/);
  });
});
