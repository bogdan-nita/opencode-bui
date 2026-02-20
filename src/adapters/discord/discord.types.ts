import type { BridgeAdapter } from "@bridge/bridge-adapter.types";

export type DiscordBridgeAdapter = BridgeAdapter;

export type DiscordCommandRestClient = {
  put: (route: `/${string}`, options: { body: unknown }) => Promise<unknown>;
};

export type DiscordCommandRoutes = {
  applicationCommands: (applicationId: string) => `/${string}`;
  applicationGuildCommands: (applicationId: string, guildId: string) => `/${string}`;
};
