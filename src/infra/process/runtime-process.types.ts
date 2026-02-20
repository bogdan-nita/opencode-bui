export type ProcessRunOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export type ProcessRunResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};
