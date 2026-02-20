export const BRIDGE_BUTTON_PREFIX = "bui";

export function encodeBridgeButtonPayload(id: string, value?: string): string {
  return `${BRIDGE_BUTTON_PREFIX}:${id}:${value || ""}`;
}
