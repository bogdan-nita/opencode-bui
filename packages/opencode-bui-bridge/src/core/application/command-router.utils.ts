import { Effect } from "effect";
import { splitCommand } from "../domain/bridge.utils.js";
import type { InboundEnvelope, OutboundEnvelope } from "../domain/envelope.types.js";
import { AgentStoreService, ClockService, OpenCodeClientService, SessionStoreService } from "./services.types.js";
import { logger } from "@infra/runtime/logger.utils.js";

function openCodeResultToOutbounds(
  envelope: InboundEnvelope,
  result: { text: string; activity?: string[]; attachments?: OutboundEnvelope["attachments"] },
  options?: { suppressActivity?: boolean },
): OutboundEnvelope[] {
  logger.info(
    {
      bridgeId: envelope.bridgeId,
      textChars: result.text.length,
      activityCount: result.activity?.length ?? 0,
      attachmentCount: result.attachments?.length ?? 0,
      suppressActivity: Boolean(options?.suppressActivity),
    },
    "[bui] Mapping OpenCode result to outbound envelopes.",
  );
  const outbound: OutboundEnvelope[] = [];

  if (!options?.suppressActivity && result.activity && result.activity.length > 0) {
    outbound.push(
      textReply(
        envelope,
        ["OpenCode activity:", ...result.activity.map((line) => `- ${line}`)].join("\n"),
      ),
    );
  }

  if (result.text || (result.attachments && result.attachments.length > 0)) {
    outbound.push({
      bridgeId: envelope.bridgeId,
      conversation: envelope.conversation,
      text: result.text || "OpenCode returned attachments.",
      ...(result.attachments && result.attachments.length > 0 ? { attachments: result.attachments } : {}),
    });
  }

  if (outbound.length === 0) {
    outbound.push(textReply(envelope, "OpenCode returned no text."));
  }

  return outbound;
}

function textReply(envelope: InboundEnvelope, text: string): OutboundEnvelope {
  return {
    bridgeId: envelope.bridgeId,
    conversation: envelope.conversation,
    text,
  };
}

function conversationCwdHint(cwd: string | undefined): string {
  return cwd || "global default";
}

export function routeInbound(
  envelope: InboundEnvelope,
  options?: {
    signal?: AbortSignal;
    onActivity?: (line: string) => Promise<void> | void;
    onPermissionRequest?: (permission: {
      id: string;
      sessionId: string;
      title: string;
      type: string;
      pattern?: string;
      details?: string;
    }) => Promise<"once" | "always" | "reject">;
  },
): Effect.Effect<OutboundEnvelope[], Error, SessionStoreService | OpenCodeClientService | AgentStoreService | ClockService> {
  return Effect.gen(function* () {
    const sessionStore = yield* SessionStoreService;
    const openCodeClient = yield* OpenCodeClientService;
    const agentStore = yield* AgentStoreService;
    const clock = yield* ClockService;

    const mapping = yield* Effect.promise(() => sessionStore.getSessionByConversation(envelope.conversation));
    let sessionId = mapping?.sessionId;
    let cwd = mapping?.cwd;

    const event = envelope.event;
    if (event.type === "button") {
      return [textReply(envelope, `Button action received: ${event.actionId}`)];
    }
    if (event.type === "system") {
      return [textReply(envelope, `System event: ${event.event}`)];
    }
    if (event.type === "media") {
      return [textReply(envelope, `Media received (${event.mediaKind}). Analysis pipeline handled by bridge coordinator.`)];
    }

    const isSlash = event.type === "slash" || (event.type === "text" && event.text.trim().startsWith("/"));
    const slash = isSlash
      ? event.type === "slash"
        ? { command: event.command, args: event.args }
        : splitCommand(event.text)
      : undefined;

    if (slash?.command) {
      logger.info({ bridgeId: envelope.bridgeId, command: slash.command }, "[bui] Processing slash command.");
    }

    if (slash?.command === "start") {
      return [
        textReply(
          envelope,
            [
              "OpenCode BUI is active.",
              "Native commands: /new, /cd, /cwd, /session, /context, /agent, /interrupt, /screenshot, /reload, /health, /pid.",
              "Other slash commands are forwarded to OpenCode.",
            ].join("\n"),
        ),
      ];
    }

    if (slash?.command === "context") {
      return [textReply(envelope, "Context details are handled by runtime. Use /context in chat to inspect current run state.")];
    }

    if (slash?.command === "pid") {
      return [textReply(envelope, `BUI PID: ${process.pid}`)];
    }

    if (slash?.command === "interrupt" || slash?.command === "interupt") {
      return [textReply(envelope, "Interrupt is handled by runtime. If a run is active, it will be cancelled.")];
    }

    if (slash?.command === "reload") {
      return [textReply(envelope, "Config reload requested. Changes apply on next read.")];
    }

    if (slash?.command === "health") {
      return [
        textReply(
          envelope,
          [
            "BUI health",
            `- PID: ${process.pid}`,
            `- Unix time: ${clock.nowUnixSeconds()}`,
            `- Session: ${sessionId ?? "none"}`,
            `- Workspace: ${conversationCwdHint(cwd)}`,
          ].join("\n"),
        ),
      ];
    }

    if (slash?.command === "session") {
      return [textReply(envelope, sessionId ? `Current OpenCode session: ${sessionId}` : "No active session yet.")];
    }

    if (slash?.command === "cwd") {
      return [textReply(envelope, `Current workspace path: ${conversationCwdHint(cwd)}`)];
    }

    if (slash?.command === "new") {
      const nextPath = slash.args.trim() || cwd;
      yield* Effect.promise(() => sessionStore.clearSessionForConversation(envelope.conversation));
      const created = yield* Effect.promise(() =>
        openCodeClient.createSession({
          ...(nextPath ? { cwd: nextPath } : {}),
          ...(options?.signal ? { signal: options.signal } : {}),
          ...(options?.onActivity ? { onActivity: options.onActivity } : {}),
          ...(options?.onPermissionRequest ? { onPermissionRequest: options.onPermissionRequest } : {}),
        }),
      );
      const createdSessionId = created.sessionId;
      if (createdSessionId) {
        sessionId = createdSessionId;
        cwd = nextPath || undefined;
        yield* Effect.promise(() =>
          sessionStore.setSessionForConversation(
            envelope.conversation,
            createdSessionId,
            ...(cwd ? [cwd] : []),
          ),
        );
      }

      return [
        textReply(
          envelope,
          `Started new session${sessionId ? `: ${sessionId}` : ""}${cwd ? `\nWorkspace: ${cwd}` : ""}`,
        ),
      ];
    }

    if (slash?.command === "cd") {
      const nextPath = slash.args.trim();
      if (!nextPath) {
        return [textReply(envelope, "Usage: /cd <path>")];
      }

      if (!sessionId) {
        const created = yield* Effect.promise(() => openCodeClient.createSession());
        sessionId = created.sessionId;
      }
      if (!sessionId) {
        return [textReply(envelope, "Could not create OpenCode session.")];
      }

      cwd = nextPath;
      const currentSessionId = sessionId;
      yield* Effect.promise(() => sessionStore.setSessionForConversation(envelope.conversation, currentSessionId, ...(cwd ? [cwd] : [])));
      yield* Effect.promise(() => sessionStore.setSessionCwd(currentSessionId, nextPath));
      return [textReply(envelope, `Workspace updated to: ${cwd}`)];
    }

    if (slash?.command === "agent") {
      const parsed = splitCommand(`/${slash.args}`);
      if (parsed.command === "list") {
        const agents = yield* Effect.promise(() => agentStore.list());
        if (agents.length === 0) {
          return [textReply(envelope, "No saved agents. Create one with /agent new <name> <prompt-template>")];
        }
        return [textReply(envelope, ["Saved agents:", ...agents.map((a) => `- ${a.name}`)].join("\n"))];
      }

      if (parsed.command === "new") {
        const firstSpace = parsed.args.indexOf(" ");
        if (firstSpace < 1) {
          return [textReply(envelope, "Usage: /agent new <name> <prompt-template>")];
        }
        const name = parsed.args.slice(0, firstSpace).trim();
        const template = parsed.args.slice(firstSpace + 1).trim();
        if (!name || !template) {
          return [textReply(envelope, "Usage: /agent new <name> <prompt-template>")];
        }
        yield* Effect.promise(() => agentStore.save(name, template));
        return [textReply(envelope, `Agent saved: ${name}`)];
      }

      if (parsed.command === "run") {
        const firstSpace = parsed.args.indexOf(" ");
        const name = firstSpace < 0 ? parsed.args.trim() : parsed.args.slice(0, firstSpace).trim();
        const runArgs = firstSpace < 0 ? "" : parsed.args.slice(firstSpace + 1).trim();
        if (!name) {
          return [textReply(envelope, "Usage: /agent run <name> [args]")];
        }

        const agent = yield* Effect.promise(() => agentStore.get(name));
        if (!agent) {
          return [textReply(envelope, `Agent not found: ${name}`)];
        }

        const prompt = agent.template.replaceAll("{{args}}", runArgs);
        const result = yield* Effect.promise(() =>
          openCodeClient.runPrompt({
            prompt,
            ...(sessionId ? { sessionId } : {}),
            ...(cwd ? { cwd } : {}),
            ...(options?.signal ? { signal: options.signal } : {}),
            ...(options?.onActivity ? { onActivity: options.onActivity } : {}),
            ...(options?.onPermissionRequest ? { onPermissionRequest: options.onPermissionRequest } : {}),
          }),
        );
        const resultSessionId = result.sessionId;
        if (resultSessionId && resultSessionId !== sessionId) {
          sessionId = resultSessionId;
          yield* Effect.promise(() =>
            sessionStore.setSessionForConversation(envelope.conversation, resultSessionId, ...(cwd ? [cwd] : [])),
          );
        }
        return openCodeResultToOutbounds(envelope, result, { suppressActivity: Boolean(options?.onActivity) });
      }

      return [
        textReply(
          envelope,
          "Agent utility commands: /agent list, /agent new <name> <prompt-template>, /agent run <name> [args]",
        ),
      ];
    }

    if (slash?.command === "screenshot") {
      return [
        {
          bridgeId: envelope.bridgeId,
          conversation: envelope.conversation,
          text: "Capturing screenshot...",
          meta: {
            action: "capture-screenshot",
            ...(slash.args ? { note: slash.args } : {}),
          },
        },
      ];
    }

    if (slash?.command) {
      logger.info({ command: slash.command }, "[bui] Forwarding slash command to OpenCode.");
      const result = yield* Effect.promise(() =>
        openCodeClient.runCommand({
          command: slash.command,
          ...(slash.args ? { args: slash.args } : {}),
          ...(sessionId ? { sessionId } : {}),
          ...(cwd ? { cwd } : {}),
          ...(options?.signal ? { signal: options.signal } : {}),
          ...(options?.onActivity ? { onActivity: options.onActivity } : {}),
          ...(options?.onPermissionRequest ? { onPermissionRequest: options.onPermissionRequest } : {}),
        }),
      );
      const resultSessionId = result.sessionId;
      if (resultSessionId && resultSessionId !== sessionId) {
        sessionId = resultSessionId;
        yield* Effect.promise(() =>
          sessionStore.setSessionForConversation(envelope.conversation, resultSessionId, ...(cwd ? [cwd] : [])),
        );
      }
      const outbounds = openCodeResultToOutbounds(envelope, result, { suppressActivity: Boolean(options?.onActivity) });
      if (outbounds.length === 1 && outbounds[0]?.text === "OpenCode returned no text.") {
        return [textReply(envelope, `Command /${slash.command} executed.`)];
      }
      return outbounds;
    }

    const prompt = event.type === "text" ? event.text : "";
    const result = yield* Effect.promise(() =>
      openCodeClient.runPrompt({
        prompt,
        ...(sessionId ? { sessionId } : {}),
        ...(cwd ? { cwd } : {}),
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.onActivity ? { onActivity: options.onActivity } : {}),
        ...(options?.onPermissionRequest ? { onPermissionRequest: options.onPermissionRequest } : {}),
      }),
    );
    const resultSessionId = result.sessionId;
    if (resultSessionId && resultSessionId !== sessionId) {
      sessionId = resultSessionId;
      yield* Effect.promise(() =>
        sessionStore.setSessionForConversation(envelope.conversation, resultSessionId, ...(cwd ? [cwd] : [])),
      );
    }

    return openCodeResultToOutbounds(envelope, result, { suppressActivity: Boolean(options?.onActivity) });
  });
}
