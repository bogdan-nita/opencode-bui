import pino from "pino";
import { resolveLoggerConfig } from "./logger.utils";

const resolved = resolveLoggerConfig();

export const logger = pino(
  resolved.targets.length > 0
    ? {
        level: resolved.level,
        transport: {
          targets: resolved.targets,
        },
      }
    : { level: resolved.level },
);
