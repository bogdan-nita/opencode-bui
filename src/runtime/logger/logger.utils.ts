import { resolve } from "node:path";
import { DEFAULT_LOG_FILE_NAME, DEFAULT_LOG_LEVEL, TEST_LOG_LEVEL } from "./logger.consts";
import type { LoggerResolvedConfig } from "./logger.types";

export function resolveLoggerConfig(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): LoggerResolvedConfig {
  const level = env.LOG_LEVEL?.trim() || (env.NODE_ENV === "test" ? TEST_LOG_LEVEL : DEFAULT_LOG_LEVEL);
  const usePretty = env.BUI_PRETTY_LOGS !== "0";
  const fileLoggingEnabled = env.BUI_LOG_TO_FILE !== "0";
  const defaultLogFilePath = resolve(cwd, DEFAULT_LOG_FILE_NAME);
  const logFilePath = env.BUI_LOG_FILE?.trim() || defaultLogFilePath;

  const targets: LoggerResolvedConfig["targets"] = [];
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

  return {
    level,
    logFilePath,
    usePretty,
    fileLoggingEnabled,
    targets,
  };
}
