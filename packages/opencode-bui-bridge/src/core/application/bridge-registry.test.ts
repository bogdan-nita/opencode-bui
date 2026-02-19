import { describe, expect, it } from "vitest";
import { allBridgeDefinitions } from "./bridge-registry.utils.js";

describe("bridge registry definitions", () => {
  it("ensures each bridge definition exposes required abstraction hooks", () => {
    const definitions = allBridgeDefinitions();
    expect(definitions.length).toBeGreaterThan(0);

    for (const definition of definitions) {
      expect(typeof definition.id).toBe("string");
      expect(typeof definition.label).toBe("string");
      expect(typeof definition.createAdapter).toBe("function");
      expect(typeof definition.assertConfigured).toBe("function");
      expect(typeof definition.healthcheck).toBe("function");
      expect(typeof definition.runtimePolicy).toBe("function");
      expect(Array.isArray(definition.onboarding.env)).toBe(true);
      expect(typeof definition.onboarding.renderConfig).toBe("function");
    }
  });
});
