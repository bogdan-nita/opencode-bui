import type { BridgeID } from "@bridge/types"

export class BUIError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class BridgeError extends BUIError {
  constructor(
    public readonly bridgeId: BridgeID,
    message: string,
  ) {
    super(`[${bridgeId}] ${message}`)
  }
}

export class ConfigurationError extends BUIError {
  constructor(message: string, public readonly key?: string) {
    super(key ? `[${key}] ${message}` : message)
  }
}

export class OpenCodeError extends BUIError {
  constructor(message: string, public readonly exitCode?: number) {
    super(exitCode !== undefined ? `${message} (exit code: ${exitCode})` : message)
  }
}

export class SessionError extends BUIError {
  constructor(
    public readonly sessionId: string,
    message: string,
  ) {
    super(`[session:${sessionId}] ${message}`)
  }
}

export class PermissionError extends BUIError {
  constructor(
    public readonly userId: string,
    message: string,
  ) {
    super(`[user:${userId}] ${message}`)
  }
}

export class LockError extends BUIError {
  constructor(
    public readonly resource: string,
    message: string,
  ) {
    super(`[lock:${resource}] ${message}`)
  }
}

export class StorageError extends BUIError {
  constructor(
    public readonly store: string,
    message: string,
  ) {
    super(`[store:${store}] ${message}`)
  }
}
