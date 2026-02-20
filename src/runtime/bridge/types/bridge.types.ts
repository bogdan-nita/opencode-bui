export type BridgeID = "telegram" | "discord";
export type BridgeId = BridgeID;

export type UserRef = {
  id: string;
  username?: string;
  displayName?: string;
};

export type ChannelRef = {
  id: string;
  kind: "dm" | "group" | "thread" | "guild-channel" | "unknown";
  title?: string;
};

export type ConversationRef = {
  bridgeId: BridgeID;
  channelId: string;
  threadId?: string;
};

export type BridgeCapabilities = {
  slashCommands: boolean;
  buttons: boolean;
  mediaUpload: boolean;
  mediaDownload: boolean;
  messageEdit: boolean;
  threads: boolean;
  markdown: "none" | "limited" | "rich";
};
