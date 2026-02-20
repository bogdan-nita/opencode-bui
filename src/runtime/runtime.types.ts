import type { BridgeAdapter } from "@bridge/bridge-adapter.types";
import type { RuntimeConfig } from "@config";

export type RuntimeDependencies = {
  config: RuntimeConfig;
  bridges: BridgeAdapter[];
  waitForShutdown?: boolean;
};
