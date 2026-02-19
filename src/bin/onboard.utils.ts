import { confirm, isCancel, select, text } from "@clack/prompts";
import { basename, resolve } from "node:path";
import { discoverConfigContext, readRuntimeConfig } from "@core/config.js";
import { ensureDir, fileExists, writeTextFile } from "@infra/runtime/runtime-fs.utils.js";
import { allBridgeDefinitions } from "@core/application/bridge-registry.utils.js";
import type { BridgeName } from "@core/config.js";
import type { OnboardResult } from "./onboard.types.js";

async function writeIfMissing(path: string, content: string): Promise<void> {
  if (!(await fileExists(path))) {
    await writeTextFile(path, content);
  }
}

function assertNotCancelled<T>(value: T | symbol, message: string): T {
  if (isCancel(value)) {
    throw new Error(message);
  }
  return value as T;
}

export async function runOnboarding(): Promise<OnboardResult> {
  const discovery = await discoverConfigContext();
  const targetRoot = discovery.nearestOpencodeDir
    ? basename(discovery.nearestOpencodeDir) === ".opencode"
      ? resolve(discovery.nearestOpencodeDir, "bui")
      : discovery.nearestOpencodeDir
    : resolve(process.env.HOME ?? process.cwd(), ".config", "opencode", "bui");
  await ensureDir(targetRoot);

  const configPath = resolve(targetRoot, "opencode-bui.config.ts");
  const envPath = resolve(targetRoot, ".env");

  const interactive = assertNotCancelled(
    await confirm({ message: "Run interactive onboarding?", initialValue: true }),
    "Onboarding cancelled",
  );

  const definitions = allBridgeDefinitions();
  const defaultBridge = definitions[0]?.id;
  if (!defaultBridge) {
    throw new Error("No bridge definitions are registered.");
  }

  let selectedBridges: BridgeName[] = [defaultBridge];
  const envValues = new Map<string, string>();

  if (interactive) {
    const bridgeOptions = definitions.map((definition) => ({ value: definition.id, label: definition.label }));
    const selectedBridge = assertNotCancelled(
      await select({
        message: "Which bridge do you want to configure now?",
        options: definitions.length > 1 ? [...bridgeOptions, { value: "all", label: "All enabled bridges" }] : bridgeOptions,
      }),
      "Onboarding cancelled",
    );

    selectedBridges =
      selectedBridge === "all"
        ? definitions.map((definition) => definition.id)
        : [selectedBridge as BridgeName];

    for (const definition of definitions) {
      const isEnabled = selectedBridges.includes(definition.id);
      if (!isEnabled) {
        continue;
      }
      for (const prompt of definition.onboarding.env) {
        if (!prompt.prompt) {
          continue;
        }
        const value = assertNotCancelled(
          await text({
            message: prompt.prompt,
            ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}),
          }),
          "Onboarding cancelled",
        );
        envValues.set(prompt.key, value);
      }
    }
  }

  const bridgeConfigLines = definitions.flatMap((definition) => definition.onboarding.renderConfig(selectedBridges.includes(definition.id)));

  const configTemplate = [
    "export default {",
    "  runtimeDir: process.env.BUI_RUNTIME_DIR || undefined,",
    "  dbPath: process.env.BUI_DB_PATH || undefined,",
    "  opencodeBin: \"opencode\",",
    "  opencodeAttachUrl: process.env.OPENCODE_ATTACH_URL || undefined,",
    "  bridges: {",
    ...bridgeConfigLines,
    "  },",
    "}",
    "",
  ].join("\n");

  const envKeys = new Set<string>();
  for (const definition of definitions) {
    for (const item of definition.onboarding.env) {
      envKeys.add(item.key);
    }
  }

  const envTemplate = [
    ...Array.from(envKeys).map((key) => `${key}=${envValues.get(key) ?? ""}`),
    "",
    "OPENCODE_BIN=opencode",
    "OPENCODE_ATTACH_URL=",
    "",
    "# Optional runtime overrides",
    "BUI_RUNTIME_DIR=",
    "BUI_DB_PATH=",
    "BUI_UPLOAD_DIR=",
    "BUI_LOCK_PATH=",
    "",
  ].join("\n");

  const writeEnvFile = assertNotCancelled(
    await confirm({ message: "Create a local .env file for secrets?", initialValue: false }),
    "Onboarding cancelled",
  );

  await writeIfMissing(configPath, configTemplate);
  if (writeEnvFile) {
    await writeIfMissing(envPath, envTemplate);
  }

  await readRuntimeConfig({ fresh: true, cwd: targetRoot });
  return { targetRoot, configPath, ...(writeEnvFile ? { envPath } : {}) };
}
