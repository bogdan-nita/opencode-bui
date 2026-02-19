import type { BridgeAdapter } from "../ports/bridge-adapter.types.js";
import type { RuntimeConfig } from "../../infra/config/config.types.js";

export type BuiRuntimeDependencies = {
  config: RuntimeConfig;
  bridges: BridgeAdapter[];
  waitForShutdown?: boolean;
};
