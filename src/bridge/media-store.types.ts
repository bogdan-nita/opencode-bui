import type { BridgeID } from "./bridge.types";

export interface MediaStore {
  saveRemoteFile(input: {
    bridgeId: BridgeID;
    conversationId: string;
    fileNameHint?: string;
    bytes: Uint8Array;
  }): Promise<string>;
}
