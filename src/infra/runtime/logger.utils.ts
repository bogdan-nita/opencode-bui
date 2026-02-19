import pino from "pino";

const level = process.env.LOG_LEVEL?.trim() || (process.env.NODE_ENV === "test" ? "silent" : "info");
const prettyEnabled = process.env.BUI_PRETTY_LOGS !== "0";
const usePretty = prettyEnabled;

export const logger = pino(
  usePretty
    ? {
        level,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : { level },
);
