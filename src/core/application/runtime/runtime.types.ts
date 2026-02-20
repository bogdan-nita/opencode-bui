import type { BridgeAdapter } from "../../ports/bridge-adapter.types";
import type { RuntimeConfig } from "@infra/config/config";

export type RuntimeDependencies = {
  config: RuntimeConfig;
  bridges: BridgeAdapter[];
  waitForShutdown?: boolean;
};
