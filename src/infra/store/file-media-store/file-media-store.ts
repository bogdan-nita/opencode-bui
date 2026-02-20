import { resolve } from "node:path";
import type { MediaStore } from "@core/ports/media-store.types";
import { ensureDir, writeBytesFile } from "@infra/runtime/runtime-fs";

function sanitizeFileName(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized.length > 0 ? normalized : "file";
}

export function createFileMediaStore(uploadRoot: string): MediaStore {
  return {
    async saveRemoteFile(input) {
      const directory = resolve(uploadRoot, input.bridgeId, input.conversationId);
      await ensureDir(directory);
      const fileName = sanitizeFileName(input.fileNameHint || `upload-${Date.now()}`);
      const destination = resolve(directory, fileName);
      await writeBytesFile(destination, input.bytes);
      return destination;
    },
  };
}
