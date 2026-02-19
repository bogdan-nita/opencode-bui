import type { BridgeId } from "../domain/bridge.types.js";

export interface MediaStore {
  saveRemoteFile(input: {
    bridgeId: BridgeId;
    conversationId: string;
    fileNameHint?: string;
    bytes: Uint8Array;
  }): Promise<string>;
}
