export { bridgeNameSchema, mergedConfigSchema, userConfigSchema } from "./config.schema";
export type { MergedConfigInput } from "./config.schema";
export type { BridgeName, ConfigDiscovery, RuntimeConfig, RuntimePaths } from "./config.types";
export {
  assertBridgeConfigured,
  buildRuntimeConfig,
  discoverConfigContext,
  enabledBridges,
  findNearestBuiConfig,
  findNearestOpencodeConfig,
  findNearestOpencodeDir,
  loadEnvFiles,
  readRuntimeConfig,
  resetRuntimeConfigCache,
  resolvePaths,
  toFriendlyZodError,
} from "./config.utils";
