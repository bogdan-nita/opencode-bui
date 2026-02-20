import { describe, expect, it } from "vitest";
import { resolveLoggerConfig } from "./logger.utils";

describe("runtime logger config", () => {
  it("uses test log level by default in test env", () => {
    const cfg = resolveLoggerConfig({ NODE_ENV: "test" }, "/tmp/project");
    expect(cfg.level).toBe("silent");
  });

  it("supports explicit level, no pretty, no file logging", () => {
    const cfg = resolveLoggerConfig(
      {
        LOG_LEVEL: "debug",
        BUI_PRETTY_LOGS: "0",
        BUI_LOG_TO_FILE: "0",
      },
      "/tmp/project",
    );

    expect(cfg.level).toBe("debug");
    expect(cfg.usePretty).toBe(false);
    expect(cfg.fileLoggingEnabled).toBe(false);
    expect(cfg.targets).toHaveLength(0);
  });

  it("builds pretty and file targets with default path", () => {
    const cfg = resolveLoggerConfig({}, "/tmp/project");

    expect(cfg.usePretty).toBe(true);
    expect(cfg.fileLoggingEnabled).toBe(true);
    expect(cfg.logFilePath).toBe("/tmp/project/opencode-bui.log");
    expect(cfg.targets.map((target) => target.target)).toEqual(["pino-pretty", "pino/file"]);
  });
});
