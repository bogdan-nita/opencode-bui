import type { BridgeAdapter, ConversationRef } from "@bridge/types";

export type ActivityState = {
  queue: string[];
  lines: string[];
  messageToken: string | undefined;
};

export type ActivityConfig = {
  flushIntervalMs: number;
  maxLinesPerFlush: number;
  retainLines: number;
};

function renderActivityText(activityLines: string[], retainLines: number): string {
  const recent = activityLines.slice(-retainLines);
  const body = recent.map((line) => `> ${line}`);
  const lines = body.length > 0 ? body : ["> run started"];
  let text = lines.join("\n");
  while (text.length > 3500 && lines.length > 2) {
    lines.splice(0, 1);
    text = lines.join("\n");
  }
  return text;
}

export function createActivityTracker(_config: ActivityConfig): ActivityState {
  return {
    queue: [],
    lines: [],
    messageToken: undefined,
  };
}

export async function flushActivity(
  deps: { bridge: BridgeAdapter; conversation: ConversationRef },
  state: ActivityState,
  config: ActivityConfig,
): Promise<void> {
  if (state.queue.length === 0) {
    return;
  }
  const lines = state.queue.splice(0, config.maxLinesPerFlush);
  state.lines.push(...lines);
  
  const text = renderActivityText(state.lines, config.retainLines);
  
  if (deps.bridge.upsertActivityMessage) {
    state.messageToken = await deps.bridge.upsertActivityMessage({
      conversation: deps.conversation,
      text,
      ...(state.messageToken ? { token: state.messageToken } : {}),
    });
  } else {
    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      text,
    });
  }
}

export function scheduleActivityFlush(
  state: ActivityState,
  config: ActivityConfig,
  flushFn: () => void,
): void {
  if (state.queue.length > 0) {
    setTimeout(flushFn, config.flushIntervalMs);
  }
}
