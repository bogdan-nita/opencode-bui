import type { BridgeName } from "@config";
import type { BridgeDefinition } from "../bridge-definition/bridge-definition.types";

export type BridgeRegistry = Record<BridgeName, BridgeDefinition>;
