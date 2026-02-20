import type { BridgeName, RuntimeConfig } from "@config";
import type { BridgeAdapter } from "../types/bridge-adapter.types";
import type { ReadonlyDeep } from "type-fest";
import type { BridgeTestResult } from "../bridge-test";

export type BridgeFactory = (config: RuntimeConfig) => Promise<BridgeAdapter>;

export type BridgeOnboardingPrompt = {
  key: string;
  prompt?: string;
  placeholder?: string;
};

export type BridgeRuntimePolicy = ReadonlyDeep<{
  backlog: {
    enabled: boolean;
    staleSeconds: number;
    batchWindowMs: number;
  };
}>;

export type BridgeDefinition = {
  id: BridgeName;
  label: string;
  createAdapter: BridgeFactory;
  assertConfigured: (config: RuntimeConfig) => void;
  healthcheck: (config: RuntimeConfig, timeoutMs: number) => Promise<BridgeTestResult>;
  runtimePolicy: (config: RuntimeConfig) => BridgeRuntimePolicy;
  onboarding: {
    renderConfig: (enabled: boolean) => string[];
    env: BridgeOnboardingPrompt[];
  };
};
