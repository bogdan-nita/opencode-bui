// Bridge Framework - adapters, registry, supervisor, and types

// Types
export * from "./types";

// Utils
export * from "./utils";

// Registry
export * from "./registry/bridge-registry";
export type { BridgeRegistry } from "./registry/bridge-registry.types";

// Supervisor
export * from "./supervisor/bridge-supervisor";

// Bridge Definition
export type { BridgeDefinition, BridgeFactory, BridgeOnboardingPrompt, BridgeRuntimePolicy } from "./bridge-definition/bridge-definition.types";

// Bridge Test
export * from "./bridge-test/bridge-test";
export type { BridgeTestResult } from "./bridge-test/bridge-test.types";

// Health Service
export * from "./health-service/health-service";

// Media Coordinator
export * from "./media-coordinator/media-coordinator";
export type { ScreenshotRequest } from "./media-coordinator/media-coordinator.types";

// Adapters
export { createTelegramBridge } from "./adapters/telegram/telegram.bridge";
export { telegramBridgeDefinition } from "./adapters/telegram/telegram.definition";
export { createDiscordBridge } from "./adapters/discord/discord.bridge";
export { discordBridgeDefinition } from "./adapters/discord/discord.definition";
