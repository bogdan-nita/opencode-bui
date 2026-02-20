import type { BridgeAdapter, BridgeRuntimeHandlers } from "../types/bridge-adapter.types";
import { logger } from "@runtime/logger";

export async function startAllBridges(bridges: BridgeAdapter[], handlers: BridgeRuntimeHandlers): Promise<void> {
  await Promise.all(
    bridges.map(async (bridge) => {
      logger.info(`[bui] Starting bridge '${bridge.id}'.`);
      await bridge.start(handlers);
      logger.info(`[bui] Bridge '${bridge.id}' start requested.`);
    }),
  );
}

export async function stopAllBridges(bridges: BridgeAdapter[]): Promise<void> {
  await Promise.all(
    bridges.map(async (bridge) => {
      logger.info(`[bui] Stopping bridge '${bridge.id}'.`);
      await bridge.stop();
      logger.info(`[bui] Bridge '${bridge.id}' stopped.`);
    }),
  );
}

export async function waitForShutdownSignal(): Promise<"SIGINT" | "SIGTERM"> {
  return await new Promise((resolveSignal) => {
    const onSigInt = () => {
      cleanup();
      resolveSignal("SIGINT");
    };
    const onSigTerm = () => {
      cleanup();
      resolveSignal("SIGTERM");
    };

    const cleanup = () => {
      process.off("SIGINT", onSigInt);
      process.off("SIGTERM", onSigTerm);
    };

    process.once("SIGINT", onSigInt);
    process.once("SIGTERM", onSigTerm);
  });
}
