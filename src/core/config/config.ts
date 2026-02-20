export type { BridgeName, ConfigDiscovery, RuntimeConfig, RuntimePaths } from "@infra/config/config";
import type { BridgeName, RuntimeConfig } from "@infra/config/config";
import { bridgeDefinitionById } from "@core/application/bridge-registry";
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
} from "@infra/config/config";

export function assertBridgeConfigured(config: RuntimeConfig, bridge: BridgeName): void {
  bridgeDefinitionById(bridge).assertConfigured(config);
}
