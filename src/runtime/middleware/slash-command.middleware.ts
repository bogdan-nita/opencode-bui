import type { InboundEnvelope } from "@bridge/envelope.types";
import { splitCommand } from "@bridge/bridge.utils";
import type { PermissionDecision } from "../state/runtime-state.types";

export type ParsedSlashCommand = {
  command: string;
  args: string;
};

export type PermissionResponseFromText = {
  permissionId?: string;
  response: PermissionDecision;
};

const normalizeCommand = (commandRaw: string): string => commandRaw.toLowerCase().split("@", 1)[0] || "";

export function parseSlashCommand(envelope: InboundEnvelope): ParsedSlashCommand | undefined {
  if (envelope.event.type === "slash") {
    return { command: normalizeCommand(envelope.event.command), args: envelope.event.args };
  }
  if (envelope.event.type === "text" && envelope.event.text.trim().startsWith("/")) {
    const parsed = splitCommand(envelope.event.text);
    return { command: normalizeCommand(parsed.command), args: parsed.args };
  }
  return undefined;
}

export function parsePermissionResponseFromText(envelope: InboundEnvelope): PermissionResponseFromText | undefined {
  const slash = parseSlashCommand(envelope);
  if (!slash) {
    return undefined;
  }
  if (slash.command !== "permit" && slash.command !== "permission" && slash.command !== "allow") {
    return undefined;
  }
  const [responseRaw, permissionIdRaw] = slash.args.split(/\s+/, 2);
  const response = responseRaw === "once" || responseRaw === "always" || responseRaw === "reject" ? responseRaw : undefined;
  const permissionId = permissionIdRaw?.trim();
  if (!response) {
    return undefined;
  }
  return permissionId ? { permissionId, response } : { response };
}
