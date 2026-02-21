import { createOpenCodeClient } from "@agent/client";
import type { OpenCodeClient } from "@bridge/types";

export type CreateAgentOptions = {
  opencodeBin: string;
  attachUrl?: string;
};

export function createAgent(options: CreateAgentOptions): OpenCodeClient {
  return createOpenCodeClient({
    opencodeBin: options.opencodeBin,
    ...(options.attachUrl ? { attachUrl: options.attachUrl } : {}),
  });
}

export async function warmupAgent(agent: OpenCodeClient): Promise<void> {
  if (agent.warmup) {
    await agent.warmup();
  }
}
