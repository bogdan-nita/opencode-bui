export { bridgeNameSchema, mergedConfigSchema, userConfigSchema } from "./config.schema";
export type { MergedConfigInput } from "./config.schema";
export type { BridgeName, ConfigDiscovery, RuntimeConfig, RuntimePaths } from "./config.types";

// Re-export from sharded modules
export {
  discoverConfigContext,
  findNearestBuiConfig,
  findNearestOpencodeConfig,
  findNearestOpencodeDir,
} from "./paths";

export { loadEnvFiles } from "./env";

export {
  buildRuntimeConfig,
  readRuntimeConfig,
  resetRuntimeConfigCache,
  resolvePaths,
} from "./merge";

export {
  assertBridgeConfigured,
  enabledBridges,
  toFriendlyZodError,
} from "./validation";
