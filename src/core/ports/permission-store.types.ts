export type PermissionDecision = "once" | "always" | "reject";

export type PermissionRecord = {
  permissionId: string;
  conversationKey: string;
  requesterUserId: string;
  status: "pending" | "submitted" | "expired";
  expiresAtUnixSeconds: number;
  response?: PermissionDecision;
};

export type PermissionStore = {
  createPending: (input: {
    permissionId: string;
    conversationKey: string;
    requesterUserId: string;
    expiresAtUnixSeconds: number;
  }) => Promise<void>;
  getById: (permissionId: string) => Promise<PermissionRecord | undefined>;
  markExpired: (permissionId: string) => Promise<void>;
  resolvePending: (input: {
    permissionId: string;
    response: PermissionDecision;
  }) => Promise<"resolved" | "already_submitted" | "expired" | "missing">;
};
