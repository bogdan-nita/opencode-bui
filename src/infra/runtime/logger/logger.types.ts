export type LoggerTransportTarget = {
  target: string;
  options?: Record<string, unknown>;
};

export type LoggerResolvedConfig = {
  level: string;
  logFilePath: string;
  usePretty: boolean;
  fileLoggingEnabled: boolean;
  targets: LoggerTransportTarget[];
};
