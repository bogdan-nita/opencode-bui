import type { InboundEnvelope } from "@bridge/types";
import { splitCommand } from "@bridge/utils";

export function isInterruptEvent(envelope: InboundEnvelope): boolean {
  if (envelope.event.type === "slash") {
    return envelope.event.command === "interrupt" || envelope.event.command === "interupt";
  }
  if (envelope.event.type === "text" && envelope.event.text.trim().startsWith("/")) {
    const command = splitCommand(envelope.event.text).command;
    return command === "interrupt" || command === "interupt";
  }
  return false;
}
