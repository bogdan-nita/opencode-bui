import type { BridgeName } from "@config";
import type { BridgeDefinition } from "@bridge/bridge-definition";

export type BridgeRegistry = Record<BridgeName, BridgeDefinition>;
