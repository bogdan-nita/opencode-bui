import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAgent, listAgents, renderAgentPrompt } from "../src/core/agents";

describe("agent templates", () => {
  let dir = "";
  let storePath = "";

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "opencode-bui-test-"));
    storePath = join(dir, "agents.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates and lists agents", async () => {
    await createAgent(storePath, "Fixer", "Fix this issue: {{args}}");
    const listed = await listAgents(storePath);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.name).toBe("fixer");
  });

  it("renders template with args", async () => {
    await createAgent(storePath, "triage", "Triage request: {{args}}");
    const output = await renderAgentPrompt(storePath, "triage", "error in checkout");
    expect(output).toBe("Triage request: error in checkout");
  });
});
