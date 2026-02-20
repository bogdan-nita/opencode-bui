import { z } from "zod";

/** Schema for ClientBootstrapOptions */
export const ClientBootstrapOptionsSchema = z.object({
  opencodeBin: z.string().min(1, "opencodeBin is required"),
  attachUrl: z.string().url().optional(),
});

/** Schema for BridgeAttachmentDirective */
export const BridgeAttachmentDirectiveSchema = z.object({
  pathLike: z.string().min(1, "pathLike is required"),
  caption: z.string().optional(),
});

/** Schema for OpencodeEvent */
export const OpencodeEventSchema = z.object({
  type: z.string(),
  properties: z.record(z.unknown()).optional(),
});

/** Schema for permission request response */
export const PermissionResponseSchema = z.enum(["once", "always", "reject"]);
