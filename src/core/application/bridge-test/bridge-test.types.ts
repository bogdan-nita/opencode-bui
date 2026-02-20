import type { BridgeName } from "@core/config";

export type BridgeTestResult = {
  bridge: BridgeName;
  ok: boolean;
  latencyMs: number;
  details: string;
};
