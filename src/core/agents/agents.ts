import { readJsonFile, writeJsonFile } from "@core/store";

export type AgentTemplate = {
  template: string;
  createdAt: string;
};

type AgentStoreShape = {
  agents: Record<string, AgentTemplate>;
};

function sanitizeName(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

export async function listAgents(storePath: string): Promise<Array<{ name: string; template: string }>> {
  const data = await readJsonFile<AgentStoreShape>(storePath, { agents: {} });
  return Object.entries(data.agents)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, agent]) => ({ name, template: agent.template }));
}

export async function createAgent(storePath: string, nameRaw: string, template: string): Promise<string> {
  const name = sanitizeName(nameRaw);
  if (!name) {
    throw new Error("Agent name is required");
  }
  if (!template.trim()) {
    throw new Error("Agent template is required");
  }

  const data = await readJsonFile<AgentStoreShape>(storePath, { agents: {} });
  data.agents[name] = {
    template: template.trim(),
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(storePath, data);
  return name;
}

export async function renderAgentPrompt(
  storePath: string,
  nameRaw: string,
  args: string,
): Promise<string | undefined> {
  const name = sanitizeName(nameRaw);
  const data = await readJsonFile<AgentStoreShape>(storePath, { agents: {} });
  const match = data.agents[name];
  if (!match) {
    return undefined;
  }
  return match.template.replaceAll("{{args}}", args.trim());
}
