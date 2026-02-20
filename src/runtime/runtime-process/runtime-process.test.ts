import { describe, expect, it } from "vitest";
import { runProcess } from "./runtime-process";

describe("runtime process", () => {
  const previousBun = (globalThis as Record<string, unknown>).Bun;

  const restoreBun = () => {
    if (previousBun === undefined) {
      delete (globalThis as Record<string, unknown>).Bun;
    } else {
      (globalThis as Record<string, unknown>).Bun = previousBun;
    }
  };

  it("captures stdout for successful command", async () => {
    const result = await runProcess(["bun", "-e", "console.log('ok')"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok");
    expect(result.timedOut).toBe(false);
  });

  it("captures failure code and stderr", async () => {
    const result = await runProcess(["bun", "-e", "console.error('bad'); process.exit(3)"]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("bad");
  });

  it("marks process timeout", async () => {
    const result = await runProcess(["bun", "-e", "await new Promise((r) => setTimeout(r, 250))"], { timeoutMs: 30 });

    expect(result.timedOut).toBe(true);
    expect(result.stdout).toBe("");
  });

  it("supports Bun.spawn branch", async () => {
    const textEncoder = new TextEncoder();
    const streamFromText = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(textEncoder.encode(text));
          controller.close();
        },
      });

    (globalThis as Record<string, unknown>).Bun = {
      spawn: () => ({
        stdout: streamFromText("bun-out"),
        stderr: streamFromText(""),
        exited: Promise.resolve(0),
      }),
    };

    try {
      const result = await runProcess(["echo", "ok"]);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("bun-out");
      expect(result.timedOut).toBe(false);
    } finally {
      restoreBun();
    }
  });

  it("marks timeout on Bun.spawn abort", async () => {
    const textEncoder = new TextEncoder();
    const streamFromText = (text: string) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(textEncoder.encode(text));
          controller.close();
        },
      });

    (globalThis as Record<string, unknown>).Bun = {
      spawn: (_argv: string[], options: { signal?: AbortSignal }) => ({
        stdout: streamFromText(""),
        stderr: streamFromText(""),
        exited: new Promise<number>((resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve(0), 250);
        }),
      }),
    };

    try {
      const result = await runProcess(["echo", "ok"], { timeoutMs: 15 });
      expect(result.timedOut).toBe(true);
      expect(result.code).toBe(124);
    } finally {
      restoreBun();
    }
  });
});
