import type { BridgeAdapter } from "@bridge/bridge-adapter.types";
import type { SessionStore } from "@bridge/session-store.types";
import type { OpenCodeClient } from "@bridge/open-code-client.types";
import type { AgentStore } from "@bridge/agent-store.types";
import type { Clock } from "@bridge/clock.types";
import type { RuntimeState } from "../state/runtime-state.types";
import { processEnvelope } from "./envelope.handler";

export type FlushBacklogDeps = {
  bridge: BridgeAdapter;
  key: string;
  state: RuntimeState;
  sessionStore: SessionStore;
  openCodeClient: OpenCodeClient;
  agentStore: AgentStore;
  clock: Clock;
  config: { uploadDir: string };
};

export async function flushBacklog(deps: FlushBacklogDeps): Promise<void> {
  const { bridge, key, state, sessionStore, openCodeClient, agentStore, clock, config } = deps;
  const pending = state.pendingBacklog.get(key) || [];
  state.pendingBacklog.delete(key);
  if (pending.length === 0) {
    return;
  }
  pending.sort((a, b) => a.receivedAtUnixSeconds - b.receivedAtUnixSeconds);
  if (pending.length === 1) {
    const only = pending[0];
    if (only) {
      await processEnvelope({ bridge, envelope: only, state, sessionStore, openCodeClient, agentStore, clock, config });
    }
    return;
  }

  state.unresolvedBacklog.set(key, pending);
  const latest = pending[pending.length - 1];
  if (!latest) {
    return;
  }
  await bridge.send({
    bridgeId: latest.bridgeId,
    conversation: latest.conversation,
    text: `I received ${pending.length} queued messages while OpenCode BUI was offline. Choose how to continue.`,
    buttons: [
      [
        { id: "backlog-decision", label: "Process All", value: "all" },
        { id: "backlog-decision", label: "Latest Only", value: "latest" },
      ],
      [{ id: "backlog-decision", label: "Ignore", value: "ignore" }],
    ],
  });
}
