import type { BridgeName } from "@infra/config/config";
import type { BridgeDefinition } from "@core/application/bridge-definition";

export type BridgeRegistry = Record<BridgeName, BridgeDefinition>;
