import type { BridgeAdapter } from "@bridge/types";
import type { RuntimeConfig } from "@infra/config";

export type RuntimeDependencies = {
  config: RuntimeConfig;
  bridges: BridgeAdapter[];
  waitForShutdown?: boolean;
};
