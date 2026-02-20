import type { BridgeAdapter } from "@runtime/bridge/types";
import type { RuntimeConfig } from "@runtime/config";

export type RuntimeDependencies = {
  config: RuntimeConfig;
  bridges: BridgeAdapter[];
  waitForShutdown?: boolean;
};
