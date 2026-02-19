import pino from "pino";
import { resolve } from "node:path";

const level = process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === "test" ? "silent" : "info");
const prettyEnabled = process.env.BUI_PRETTY_LOGS !== "0";
const usePretty = prettyEnabled;
const fileLoggingEnabled = process.env.BUI_LOG_TO_FILE !== "0";
const defaultLogFilePath = resolve(process.cwd(), "opencode-bui.log");
const logFilePath = process.env.BUI_LOG_FILE?.trim() || defaultLogFilePath;

const targets: Array<{ target: string; options?: Record<string, unknown> }> = [];
if (usePretty) {
  targets.push({
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:standard",
      ignore: "pid,hostname",
    },
  });
}

if (fileLoggingEnabled) {
  targets.push({
    target: "pino/file",
    options: {
      destination: logFilePath,
      mkdir: true,
    },
  });
}

export const logger = pino(
  targets.length > 0
    ? {
        level,
        transport: {
          targets,
        },
      }
    : { level },
);
