export type AgentTemplate = {
  name: string;
  template: string;
  createdAt: string;
};

export interface AgentStore {
  list(): Promise<AgentTemplate[]>;
  save(name: string, template: string): Promise<void>;
  get(name: string): Promise<AgentTemplate | undefined>;
}
