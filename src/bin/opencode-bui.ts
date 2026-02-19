#!/usr/bin/env bun

import { cac } from "cac";
import { z } from "zod";
import {
  discoverConfigContext,
  enabledBridges,
  readRuntimeConfig,
  type BridgeName,
} from "@core/config.js";
import {
  allBridgeDefinitions,
  bridgeDefinitionById,
  createBridgesForConfig,
} from "@core/application/bridge-registry.utils.js";
import { startBuiRuntime } from "@core/application/bui-runtime.utils.js";
import { testBridgeConnectivity } from "@core/application/bridge-test.utils.js";
import { runOnboarding } from "@bin/onboard.utils.js";
import { ensureDir, fileExists } from "@infra/runtime/runtime-fs.utils.js";
import { resolve } from "node:path";
import { logger } from "@infra/runtime/logger.utils.js";

const cli = cac("opencode-bui");

async function withCliErrors(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error: ${message}`);
    process.exit(1);
  }
}

async function shouldAutoOnboard(cwd: string): Promise<boolean> {
  const discovery = await discoverConfigContext(cwd);
  if (discovery.nearestBuiConfig) {
    return false;
  }

  const globalConfigPath = resolve(
    process.env.HOME ?? process.cwd(),
    ".config",
    "opencode",
    "bui",
    "opencode-bui.config.ts",
  );
  return !(await fileExists(globalConfigPath));
}

async function startRuntimeFromConfig(
  cfg: Awaited<ReturnType<typeof readRuntimeConfig>>,
  selectedBridge?: BridgeName,
): Promise<void> {
  await ensureDir(cfg.paths.runtimeDir);

  const bridgesToStart = selectedBridge
    ? [selectedBridge]
    : enabledBridges(cfg);
  if (bridgesToStart.length === 0) {
    throw new Error(
      "No bridges are enabled. Enable at least one bridge in config (bridges.telegram.enabled or bridges.discord.enabled).",
    );
  }

  logger.info({ bridges: bridgesToStart }, "[bui] Preparing runtime startup.");

  for (const bridge of bridgesToStart) {
    bridgeDefinitionById(bridge).assertConfigured(cfg);
  }

  const bridges = await createBridgesForConfig({
    ...cfg,
    bridges: {
      ...cfg.bridges,
      telegram: {
        ...cfg.bridges.telegram,
        enabled: bridgesToStart.includes("telegram"),
      },
      discord: {
        ...cfg.bridges.discord,
        enabled: bridgesToStart.includes("discord"),
      },
    },
  });

  await startBuiRuntime({ config: cfg, bridges });
}

function parseBridgeOption(value: string | undefined): BridgeName | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = value.toLowerCase();
  const ids = allBridgeDefinitions().map((definition) => definition.id);
  if (ids.includes(parsed as BridgeName)) {
    return parsed as BridgeName;
  }
  throw new Error(
    `Unsupported bridge: ${value}. Use one of: ${ids.join(", ")}.`,
  );
}

cli
  .command("start", "Start OpenCode BUI bridges")
  .option("--bridge <name>", "Bridge to start (telegram|discord)")
  .action(async (options) => {
    await withCliErrors(async () => {
      const parsed = z
        .object({
          bridge: z.string().optional(),
        })
        .parse(options);

      const selectedBridge = parseBridgeOption(parsed.bridge);
      if (await shouldAutoOnboard(process.cwd())) {
        logger.info(
          "[bui] No local or global BUI config found. Starting onboarding.",
        );
        const onboarded = await runOnboarding();
        logger.info(
          { configPath: onboarded.configPath },
          "[bui] Onboarding finished.",
        );
      }

      const cfg = await readRuntimeConfig({ fresh: true });
      logger.info("[bui] Loaded runtime config for start command.");
      await startRuntimeFromConfig(cfg, selectedBridge);
    });
  });

cli
  .command(
    "bridge:test",
    "Validate bridge connectivity without starting runtime",
  )
  .option("--bridge <name>", "Bridge to test (telegram|discord)")
  .option("--timeout <ms>", "Request timeout in milliseconds")
  .action(async (options) => {
    await withCliErrors(async () => {
      const parsed = z
        .object({
          bridge: z.string().optional(),
          timeout: z.union([z.string(), z.number()]).optional(),
        })
        .parse(options);

      const selectedBridge = parseBridgeOption(parsed.bridge);
      const timeoutMs =
        typeof parsed.timeout === "number"
          ? parsed.timeout
          : parsed.timeout
            ? Number.parseInt(parsed.timeout, 10)
            : 8000;
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error(`Invalid timeout value: ${parsed.timeout}`);
      }

      const cfg = await readRuntimeConfig({ fresh: true });
      logger.info("[bui] Loaded runtime config for bridge connectivity tests.");
      const bridgesToTest = selectedBridge
        ? [selectedBridge]
        : enabledBridges(cfg);
      if (bridgesToTest.length === 0) {
        throw new Error(
          "No enabled bridges to test. Enable at least one bridge or pass --bridge.",
        );
      }

      for (const bridge of bridgesToTest) {
        bridgeDefinitionById(bridge).assertConfigured(cfg);
      }

      const results = await testBridgeConnectivity({
        config: cfg,
        bridges: bridgesToTest,
        timeoutMs,
      });

      const lines = ["Bridge connectivity test results:"];
      for (const result of results) {
        lines.push(
          `- ${result.bridge}: ${result.ok ? "ok" : "failed"} (${result.latencyMs}ms)${result.details ? ` - ${result.details}` : ""}`,
        );
      }
      logger.info(lines.join("\n"));

      const failed = results.filter((entry) => !entry.ok);
      if (failed.length > 0) {
        throw new Error(
          `Bridge connectivity test failed for: ${failed.map((entry) => entry.bridge).join(", ")}`,
        );
      }
      logger.info("[bui] Bridge connectivity tests passed.");
    });
  });

cli.command("doctor", "Show runtime diagnostics").action(async () => {
  await withCliErrors(async () => {
    const cfg = await readRuntimeConfig({ fresh: true });
    const lines = [
      "OpenCode BUI diagnostics",
      `- Nearest OpenCode config: ${cfg.discovery.nearestOpencodeConfig || "not found"}`,
      `- Runtime dir: ${cfg.paths.runtimeDir}`,
      `- Database path: ${cfg.paths.dbPath}`,
      `- Upload dir: ${cfg.paths.uploadDir}`,
      `- Lock path: ${cfg.paths.lockPath}`,
      `- Telegram enabled: ${cfg.bridges.telegram.enabled ? "yes" : "no"}`,
      `- Telegram token configured: ${cfg.bridges.telegram.token ? "yes" : "no"}`,
      `- Telegram allowed users: ${cfg.bridges.telegram.allowedUsers.ids.size === 0 && cfg.bridges.telegram.allowedUsers.usernames.size === 0 ? "all" : `ids:${cfg.bridges.telegram.allowedUsers.ids.size}, usernames:${cfg.bridges.telegram.allowedUsers.usernames.size}`}`,
      `- Telegram STT configured: ${cfg.bridges.telegram.sttCommand ? "yes" : "no"}`,
      `- Discord enabled: ${cfg.bridges.discord.enabled ? "yes" : "no"}`,
      `- Discord token configured: ${cfg.bridges.discord.token ? "yes" : "no"}`,
      `- OpenCode binary: ${cfg.opencodeBin}`,
      `- OpenCode attach URL: ${cfg.opencodeAttachUrl || "not set"}`,
      `- Session idle timeout: ${cfg.sessionIdleTimeoutSeconds}s`,
      `- Agent bridge tools prompt: ${process.env.BUI_AGENT_BRIDGE_TOOLS === "0" ? "disabled" : "enabled"}`,
      `- OpenCode eager start: ${process.env.BUI_OPENCODE_EAGER_START === "0" ? "disabled" : "enabled"}`,
      `- Typing indicator: ${process.env.BUI_TYPING_INDICATOR === "0" ? "disabled" : "enabled"}`,
      `- File logging enabled: ${process.env.BUI_LOG_TO_FILE === "0" ? "no" : "yes"}`,
      `- Log file path: ${process.env.BUI_LOG_FILE || `${process.cwd()}/opencode-bui.log`}`,
    ];
    logger.info(lines.join("\n"));
  });
});

cli
  .command("onboard", "Create starter BUI config and env files")
  .action(async () => {
    await withCliErrors(async () => {
      const { targetRoot, configPath, envPath } = await runOnboarding();
      const cfg = await readRuntimeConfig({ fresh: true, cwd: targetRoot });

      const lines = [
        "OpenCode BUI onboarding complete.",
        `- Target directory: ${targetRoot}`,
        `- Config file: ${configPath}`,
        ...(envPath
          ? [`- Env file: ${envPath}`]
          : ["- Env file: skipped (use shell env or add .env later)"]),
        "- Starting runtime with enabled bridges...",
      ];
      logger.info(lines.join("\n"));

      await startRuntimeFromConfig(cfg);
    });
  });

cli.help();
cli.parse();
