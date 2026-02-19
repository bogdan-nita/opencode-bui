export type { BridgeName, BuiPaths, ConfigDiscovery, RuntimeConfig } from "../infra/config/config.types.js";
import type { BridgeName, RuntimeConfig } from "../infra/config/config.types.js";
import { bridgeDefinitionById } from "./application/bridge-registry.utils.js";
export {
  buildRuntimeConfig,
  discoverConfigContext,
  findNearestBuiConfig,
  findNearestOpencodeDir,
  enabledBridges,
  findNearestOpencodeConfig,
  loadEnvFiles,
  readRuntimeConfig,
  resetRuntimeConfigCache,
  resolvePaths,
  toFriendlyZodError,
} from "../infra/config/config.utils.js";

export function assertBridgeConfigured(config: RuntimeConfig, bridge: BridgeName): void {
  bridgeDefinitionById(bridge).assertConfigured(config);
}
