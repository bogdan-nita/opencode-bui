# Handler Refactoring & Runtime Factories Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Refactor large handler files into focused utility modules and extract runtime factories with consistent structure.

**Architecture:** Split envelope.handler.ts (436 lines) and inbound.handler.ts (335 lines) into typed utility modules under handlers/{name}/ folders. Extract runtime factories to runtime/utils/{name}/ with per-module folder structure.

**Tech Stack:** Bun, TypeScript, Vitest, effect (for Effect)

---

## Phase 1: Handler Utils - Typing

### Task 1: Create typing utility

**Files:**
- Create: `src/core/handlers/envelope/typing/typing.ts`
- Create: `src/core/handlers/envelope/typing/index.ts`

**Step 1: Create typing folder**

```bash
mkdir -p src/core/handlers/envelope/typing
```

**Step 2: Create typing.ts**

```typescript
import type { ConversationRef } from "@bridge/types";
import type { BridgeAdapter } from "@bridge/types";
import { logger } from "@infra/logger";

export type TypingDeps = {
  bridge: BridgeAdapter;
  conversation: ConversationRef;
};

export async function startTypingIndicator(deps: TypingDeps): Promise<(() => Promise<void> | void) | undefined> {
  const { bridge, conversation } = deps;
  if (!bridge.beginTyping) {
    return undefined;
  }
  try {
    const stop = await bridge.beginTyping(conversation);
    logger.info({ bridgeId: bridge.id, conversation }, "[bui] Typing indicator started.");
    return stop;
  } catch (error) {
    logger.warn({ error, bridgeId: bridge.id, conversation }, "[bui] Failed to start typing indicator.");
    return undefined;
  }
}

export async function stopTypingIndicator(stop: (() => Promise<void> | void) | undefined): Promise<void> {
  if (!stop) {
    return;
  }
  try {
    await stop();
    logger.info("[bui] Typing indicator stopped.");
  } catch (error) {
    logger.warn({ error }, "[bui] Failed to stop typing indicator.");
  }
}
```

**Step 3: Create index.ts**

```typescript
export { startTypingIndicator, stopTypingIndicator } from "./typing";
export type { TypingDeps } from "./typing";
```

**Step 4: Commit**

```bash
git add src/core/handlers/envelope/typing/
git commit -m "refactor(envelope): extract typing indicator to separate module"
```

---

## Phase 2: Handler Utils - Activity

### Task 2: Create activity utility

**Files:**
- Create: `src/core/handlers/envelope/activity/activity.ts`
- Create: `src/core/handlers/envelope/activity/index.ts`

**Step 1: Create activity folder**

```bash
mkdir -p src/core/handlers/envelope/activity
```

**Step 2: Create activity.ts**

```typescript
import type { BridgeAdapter, ConversationRef } from "@bridge/types";
import { logger } from "@infra/logger";

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

export function createActivityTracker(config: ActivityConfig): ActivityState {
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
```

**Step 3: Create index.ts**

```typescript
export { createActivityTracker, flushActivity, scheduleActivityFlush } from "./activity";
export type { ActivityState, ActivityConfig } from "./activity";
```

**Step 4: Commit**

```bash
git add src/core/handlers/envelope/activity/
git commit -m "refactor(envelope): extract activity tracking to separate module"
```

---

## Phase 3: Handler Utils - Outbound

### Task 3: Create outbound utility

**Files:**
- Create: `src/core/handlers/envelope/outbound/outbound.ts`
- Create: `src/core/handlers/envelope/outbound/index.ts`

**Step 1: Create outbound folder**

```bash
mkdir -p src/core/handlers/envelope/outbound
```

**Step 2: Create outbound.ts**

```typescript
import { stat } from "node:fs/promises";
import type { BridgeAdapter, ConversationRef, OutboundEnvelope } from "@bridge/types";
import { logger } from "@infra/logger";

export type OutboundConfig = {
  maxAttachmentsPerMessage: number;
  maxAttachmentBytes: number;
};

export async function sendOutboundMessages(
  deps: { bridge: BridgeAdapter; conversation: ConversationRef },
  outbound: OutboundEnvelope[],
  config: OutboundConfig,
): Promise<void> {
  for (const message of outbound) {
    const sanitized = await filterAttachments(deps.bridge, message, config);
    try {
      await deps.bridge.send(sanitized);
      logger.info({ bridgeId: deps.bridge.id }, "[bui] Outbound message sent.");
    } catch (error) {
      logger.error({ error, bridgeId: deps.bridge.id }, "[bui] Failed to send outbound message.");
    }
  }
}

async function filterAttachments(
  bridge: BridgeAdapter,
  message: OutboundEnvelope,
  config: OutboundConfig,
): Promise<OutboundEnvelope> {
  if (!message.attachments || message.attachments.length === 0) {
    return message;
  }

  const kept = [];
  const skipped = [];

  for (const attachment of message.attachments.slice(0, config.maxAttachmentsPerMessage)) {
    try {
      const details = await stat(attachment.filePath);
      if (details.size > config.maxAttachmentBytes) {
        skipped.push(`${attachment.filePath} (too large)`);
        continue;
      }
      kept.push(attachment);
    } catch {
      skipped.push(`${attachment.filePath} (missing)`);
    }
  }

  // Handle skipped attachments notification
  if (skipped.length > 0) {
    await bridge.send({
      bridgeId: bridge.id,
      conversation: message.conversation!,
      text: ["Some attachments were skipped:", ...skipped.map((l) => `- ${l}`)].join("\n"),
    });
  }

  return kept.length > 0 ? { ...message, attachments: kept } : { ...message, attachments: undefined };
}
```

**Step 3: Create index.ts**

```typescript
export { sendOutboundMessages } from "./outbound";
export type { OutboundConfig } from "./outbound";
```

**Step 4: Commit**

```bash
git add src/core/handlers/envelope/outbound/
git commit -m "refactor(envelope): extract outbound messaging to separate module"
```

---

## Phase 4: Handler Utils - Screenshot

### Task 4: Create screenshot utility

**Files:**
- Create: `src/core/handlers/envelope/screenshot/screenshot.ts`
- Create: `src/core/handlers/envelope/screenshot/index.ts`

**Step 1: Create screenshot folder**

```bash
mkdir -p src/core/handlers/envelope/screenshot
```

**Step 2: Create screenshot.ts**

```typescript
import type { BridgeAdapter, ConversationRef, OutboundEnvelope, SessionStore, OpenCodeClient } from "@bridge/types";
import { captureScreenshot } from "@bridge/media-coordinator";
import { logger } from "@infra/logger";

export type ScreenshotDeps = {
  bridge: BridgeAdapter;
  conversation: ConversationRef;
  sessionStore: SessionStore;
  openCodeClient: OpenCodeClient;
  uploadDir: string;
};

export async function captureAndAnalyzeScreenshot(
  message: OutboundEnvelope,
  deps: ScreenshotDeps,
): Promise<void> {
  if (message.meta?.["action"] !== "capture-screenshot") {
    return;
  }

  const note = message.meta?.["note"];
  const conversationKey = `${deps.conversation.channelId}:${deps.conversation.threadId || ""}`;

  try {
    const path = await captureScreenshot(deps.uploadDir, {
      conversationId: conversationKey,
      ...(note ? { note } : {}),
    });
    logger.info({ path }, "[bui] Screenshot captured.");

    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      attachments: [{ kind: "image", filePath: path, caption: "Captured screenshot" }],
      text: "Screenshot captured and sent. Analyzing...",
    });

    const mapping = await deps.sessionStore.getSessionByConversation(deps.conversation);
    const result = await deps.openCodeClient.runPrompt({
      conversationKey,
      prompt: `User shared a local screenshot at ${path}${note ? `\nNote: ${note}` : ""}. Analyze and help.`,
      ...(mapping?.sessionId ? { sessionId: mapping.sessionId } : {}),
      ...(mapping?.cwd ? { cwd: mapping.cwd } : {}),
    });

    if (result.sessionId && result.sessionId !== mapping?.sessionId) {
      await deps.sessionStore.setSessionForConversation(deps.conversation, result.sessionId, mapping?.cwd);
    }

    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      text: result.text || "No text returned.",
    });
  } catch (error) {
    logger.error({ error }, "[bui] Screenshot pipeline failed.");
    await deps.bridge.send({
      bridgeId: deps.bridge.id,
      conversation: deps.conversation,
      text: "Screenshot capture/send failed. Check runtime logs for details.",
    });
  }
}
```

**Step 3: Create index.ts**

```typescript
export { captureAndAnalyzeScreenshot } from "./screenshot";
export type { ScreenshotDeps } from "./screenshot";
```

**Step 4: Commit**

```bash
git add src/core/handlers/envelope/screenshot/
git commit -m "refactor(envelope): extract screenshot handling to separate module"
```

---

## Phase 5: Runtime Utils - Create Stores

### Task 5: Create create-stores utility

**Files:**
- Create: `src/core/runtime/utils/create-stores/create-stores.ts`
- Create: `src/core/runtime/utils/create-stores/index.ts`

**Step 1: Create create-stores folder**

```bash
mkdir -p src/core/runtime/utils/create-stores
```

**Step 2: Create create-stores.ts**

```typescript
import { createRuntimeDB, createFileMediaStore, createLibsqlAgentStore, createLibsqlPermissionStore, createLibsqlSessionStore } from "@database";
import type { RuntimeDB } from "@database";

export type CreateStoresOptions = {
  dbPath: string;
  uploadDir: string;
};

export type RuntimeStores = {
  database: RuntimeDB;
  sessionStore: ReturnType<typeof createLibsqlSessionStore>;
  agentStore: ReturnType<typeof createLibsqlAgentStore>;
  mediaStore: ReturnType<typeof createFileMediaStore>;
  permissionStore: ReturnType<typeof createLibsqlPermissionStore>;
};

export async function createStores(options: CreateStoresOptions): Promise<RuntimeStores> {
  const database = await createRuntimeDB(options.dbPath);
  
  return {
    database,
    sessionStore: createLibsqlSessionStore(database),
    agentStore: createLibsqlAgentStore(database),
    mediaStore: createFileMediaStore(options.uploadDir),
    permissionStore: createLibsqlPermissionStore(database),
  };
}
```

**Step 3: Create index.ts**

```typescript
export { createStores } from "./create-stores";
export type { CreateStoresOptions, RuntimeStores } from "./create-stores";
```

**Step 4: Commit**

```bash
git add src/core/runtime/utils/create-stores/
git commit -m "refactor(runtime): extract create-stores to separate module"
```

---

## Phase 6: Runtime Utils - Create Clock

### Task 6: Create create-clock utility

**Files:**
- Create: `src/core/runtime/utils/create-clock/create-clock.ts`
- Create: `src/core/runtime/utils/create-clock/index.ts`

**Step 1: Create create-clock folder**

```bash
mkdir -p src/core/runtime/utils/create-clock
```

**Step 2: Create create-clock.ts**

```typescript
import { createSystemClock } from "@infra/time/system-clock";
import type { Clock } from "@bridge/types";

export function createClock(): Clock {
  return createSystemClock();
}
```

**Step 3: Create index.ts**

```typescript
export { createClock } from "./create-clock";
```

**Step 4: Commit**

```bash
git add src/core/runtime/utils/create-clock/
git commit -m "refactor(runtime): extract create-clock to separate module"
```

---

## Phase 7: Runtime Utils - Create Agent

### Task 7: Create create-agent utility

**Files:**
- Create: `src/core/runtime/utils/create-agent/create-agent.ts`
- Create: `src/core/runtime/utils/create-agent/index.ts`

**Step 1: Create create-agent folder**

```bash
mkdir -p src/core/runtime/utils/create-agent
```

**Step 2: Create create-agent.ts**

```typescript
import { createOpenCodeClient } from "@agent/client";
import type { OpenCodeClient } from "@bridge/types";

export type CreateAgentOptions = {
  opencodeBin?: string;
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
```

**Step 3: Create index.ts**

```typescript
export { createAgent, warmupAgent } from "./create-agent";
export type { CreateAgentOptions } from "./create-agent";
```

**Step 4: Commit**

```bash
git add src/core/runtime/utils/create-agent/
git commit -m "refactor(runtime): extract create-agent to separate module"
```

---

## Phase 8: Runtime Utils - Create State

### Task 8: Create create-state utility

**Files:**
- Create: `src/core/runtime/utils/create-state/create-state.ts`
- Create: `src/core/runtime/utils/create-state/index.ts`

**Step 1: Create create-state folder**

```bash
mkdir -p src/core/runtime/utils/create-state
```

**Step 2: Create create-state.ts**

```typescript
import { createRuntimeState } from "@core/state/runtime-state";
import type { RuntimeState } from "@core/state/runtime-state.types";

export function createState(): RuntimeState {
  return createRuntimeState();
}
```

**Step 3: Create index.ts**

```typescript
export { createState } from "./create-state";
```

**Step 4: Commit**

```bash
git add src/core/runtime/utils/create-state/
git commit -m "refactor(runtime): extract create-state to separate module"
```

---

## Phase 9: Update Main Handler Files

### Task 9: Update envelope.handler.ts to use new utils

**Files:**
- Modify: `src/core/handlers/envelope.handler.ts`

**Step 1: Update imports**

Replace inline typing, activity, outbound, screenshot logic with imports from new modules.

**Step 2: Commit**

```bash
git add src/core/handlers/envelope.handler.ts
git commit -m "refactor(envelope): use extracted utility modules"
```

---

## Phase 10: Update Runtime

### Task 10: Update runtime.ts to use new utils

**Files:**
- Modify: `src/core/runtime/runtime.ts`

**Step 1: Update imports**

Replace inline store/clock/agent/state creation with imports from new modules.

**Step 2: Commit**

```bash
git add src/core/runtime/runtime.ts
git commit -m "refactor(runtime): use extracted factory modules"
```

---

## Phase 11: Validation

### Task 11: Run lint

```bash
bun run lint
```

### Task 12: Run tests

```bash
bun run test
```

### Task 13: Run build

```bash
bun run build
```

### Task 14: Commit

```bash
git add -A
git commit -m "refactor: complete handler and runtime module extraction"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Extract typing utility |
| 2 | 2 | Extract activity utility |
| 3 | 3 | Extract outbound utility |
| 4 | 4 | Extract screenshot utility |
| 5 | 5 | Extract create-stores utility |
| 6 | 6 | Extract create-clock utility |
| 7 | 7 | Extract create-agent utility |
| 8 | 8 | Extract create-state utility |
| 9 | 9 | Update envelope.handler.ts |
| 10 | 10 | Update runtime.ts |
| 11 | 11-14 | Validation and commit |

Total: 14 tasks
