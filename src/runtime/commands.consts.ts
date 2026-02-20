import type { BridgeCommandDescriptor } from "@bridge/bridge-adapter.types";

export const nativeCommands: BridgeCommandDescriptor[] = [
  { command: "start", description: "Show bot help" },
  { command: "new", description: "Start a new OpenCode session" },
  { command: "cd", description: "Change workspace" },
  { command: "cwd", description: "Show workspace" },
  { command: "session", description: "Show mapped session" },
  { command: "context", description: "Show run and attach context" },
  { command: "interrupt", description: "Interrupt active OpenCode run" },
  { command: "screenshot", description: "Capture and analyze screenshot" },
  { command: "reload", description: "Reload config" },
  { command: "health", description: "Show bridge health" },
  { command: "pid", description: "Show process id" },
  { command: "agent", description: "Agent utility commands" },
  { command: "permit", description: "Resolve pending permission" },
  { command: "allow", description: "Alias for /permit" },
  { command: "help", description: "Run OpenCode /help" },
  { command: "init", description: "Run OpenCode /init" },
  { command: "undo", description: "Run OpenCode /undo" },
  { command: "redo", description: "Run OpenCode /redo" },
];

export const silentStartCommands = new Set([
  "start",
  "pid",
  "interrupt",
  "interupt",
  "reload",
  "health",
  "session",
  "cwd",
  "context",
]);
