import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyFile,
  ensureDir,
  fileExists,
  moveFile,
  readDir,
  readTextFile,
  writeBytesFile,
  writeTextFile,
} from "./runtime-fs";

describe("runtime fs", () => {
  const dirs: string[] = [];
  const previousBun = (globalThis as Record<string, unknown>).Bun;

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(async (dir) => rm(dir, { recursive: true, force: true })));
    if (previousBun === undefined) {
      delete (globalThis as Record<string, unknown>).Bun;
    } else {
      (globalThis as Record<string, unknown>).Bun = previousBun;
    }
  });

  it("creates directories and writes/reads text", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-runtime-fs-"));
    dirs.push(root);
    const nested = join(root, "a", "b");
    const filePath = join(nested, "note.txt");

    await ensureDir(nested);
    await writeTextFile(filePath, "hello");

    expect(await fileExists(filePath)).toBe(true);
    expect(await readTextFile(filePath)).toBe("hello");
    expect(await readDir(nested)).toContain("note.txt");
  });

  it("writes bytes and copies/moves files", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-runtime-fs-"));
    dirs.push(root);
    const source = join(root, "source.bin");
    const copy = join(root, "copy.bin");
    const moved = join(root, "moved.bin");

    await writeBytesFile(source, new Uint8Array([1, 2, 3]));
    await copyFile(source, copy);
    await moveFile(copy, moved);

    expect(Array.from(await readFile(source))).toEqual([1, 2, 3]);
    expect(await fileExists(copy)).toBe(false);
    expect(Array.from(await readFile(moved))).toEqual([1, 2, 3]);
  });

  it("returns false for missing files", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-runtime-fs-"));
    dirs.push(root);
    expect(await fileExists(join(root, "missing.txt"))).toBe(false);
  });

  it("uses Bun fast-path when Bun runtime is available", async () => {
    const mockQuiet = () => ({ nothrow: async () => ({ exitCode: 0 }) });
    const shell = () => ({ quiet: mockQuiet });
    const writeMock = async () => {};
    const fileMock = () => ({ text: async () => "bun-text" });

    (globalThis as Record<string, unknown>).Bun = {
      $: shell,
      write: writeMock,
      file: fileMock,
    };

    expect(await fileExists("/tmp/exists")).toBe(true);
    await ensureDir("/tmp/example");
    await writeTextFile("/tmp/a.txt", "hello");
    await writeBytesFile("/tmp/a.bin", new Uint8Array([1]));
    await copyFile("/tmp/a.bin", "/tmp/b.bin");
    expect(await readTextFile("/tmp/a.txt")).toBe("bun-text");
  });
});
