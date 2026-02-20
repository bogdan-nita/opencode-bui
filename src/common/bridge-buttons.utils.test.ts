import { describe, expect, it } from "vitest";
import { BRIDGE_BUTTON_PREFIX, encodeBridgeButtonPayload } from "./bridge-buttons.utils";

describe("bridge-buttons utils", () => {
  it("encodes payload with value", () => {
    expect(encodeBridgeButtonPayload("allow", "once")).toBe(`${BRIDGE_BUTTON_PREFIX}:allow:once`);
  });

  it("encodes payload with empty value section", () => {
    expect(encodeBridgeButtonPayload("allow")).toBe(`${BRIDGE_BUTTON_PREFIX}:allow:`);
  });
});
