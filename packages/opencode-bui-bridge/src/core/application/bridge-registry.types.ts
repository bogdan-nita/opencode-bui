import type { BridgeName } from "../../infra/config/config.types.js";
import type { BridgeDefinition } from "./bridge-definition.types.js";

export type BridgeRegistry = Record<BridgeName, BridgeDefinition>;
