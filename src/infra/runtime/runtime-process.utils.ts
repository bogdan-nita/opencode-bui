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

export async function runProcess(argv: string[], options?: ProcessRunOptions): Promise<ProcessRunResult> {
  const timeoutMs = options?.timeoutMs ?? 0;

  if (typeof Bun !== "undefined") {
    const controller = new AbortController();
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;

    const proc = Bun.spawn(argv, {
      cwd: options?.cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: controller.signal,
    });

    const [stdout, stderr, codeResult] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited.catch(() => 124),
    ]);

    if (timer) {
      clearTimeout(timer);
    }

    return {
      code: codeResult,
      stdout,
      stderr,
      timedOut,
    };
  }

  const { spawn } = await import("node:child_process");
  return await new Promise<ProcessRunResult>((resolveResult, rejectResult) => {
    const command = argv[0];
    if (!command) {
      rejectResult(new Error("No command provided to runProcess"));
      return;
    }

    const child = spawn(command, argv.slice(1), {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, timeoutMs)
        : undefined;

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      rejectResult(error);
    });
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolveResult({
        code: code ?? 0,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}
