import type { BridgeID } from "@bridge/bridge.types";

export type ConfigDiscovery = {
  nearestOpencodeConfig?: string;
  nearestOpencodeDir?: string;
  nearestBuiConfig?: string;
  nearestBuiDir?: string;
};

export type RuntimePaths = {
  runtimeDir: string;
  dbPath: string;
  uploadDir: string;
  lockPath: string;
};

export type RuntimeConfig = {
  opencodeBin: string;
  opencodeAttachUrl?: string;
  sessionIdleTimeoutSeconds: number;
  paths: RuntimePaths;
  bridges: {
    telegram: {
      enabled: boolean;
      token: string;
      allowedUsers: {
        ids: Set<number>;
        usernames: Set<string>;
      };
      sttCommand: string;
      sttTimeoutMs: number;
      backlogStaleSeconds: number;
      backlogBatchWindowMs: number;
      polling: {
        dropPendingUpdates: boolean;
      };
      commands: {
        registerOnStart: boolean;
      };
      formatting: {
        maxChunkChars: number;
      };
    };
    discord: {
      enabled: boolean;
      token: string;
      applicationId: string;
      guildScope: "global" | "guild";
      commandSyncMode: "on-start" | "manual";
      defaultGuildId?: string;
    };
  };
  discovery: ConfigDiscovery;
};

export type BridgeName = BridgeID;
