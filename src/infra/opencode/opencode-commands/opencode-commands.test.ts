import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { discoverOpencodeCommands, mergeBridgeCommands } from "./opencode-commands";

describe("discoverOpencodeCommands", () => {
  it("loads markdown command files from discovered opencode directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-bui-cmds-"));
    const commandsDir = join(root, ".opencode", "commands");
    await mkdir(commandsDir, { recursive: true });
    await writeFile(join(commandsDir, "plan.md"), "# Plan\n", "utf8");
    await writeFile(join(commandsDir, "release-notes.md"), "# Release Notes\n", "utf8");
    await writeFile(join(commandsDir, "README.txt"), "ignored\n", "utf8");

    const commands = await discoverOpencodeCommands({ nearestOpencodeDir: root });

    expect(commands.map((entry) => entry.command)).toEqual(["plan", "release_notes"]);

    await rm(root, { recursive: true, force: true });
  });
});

describe("mergeBridgeCommands", () => {
  it("keeps base command descriptions for duplicates", () => {
    const merged = mergeBridgeCommands(
      [
        { command: "help", description: "Base help" },
        { command: "new", description: "Base new" },
      ],
      [
        { command: "help", description: "Discovered help" },
        { command: "deploy", description: "Discovered deploy" },
      ],
    );

    expect(merged).toEqual([
      { command: "help", description: "Base help" },
      { command: "new", description: "Base new" },
      { command: "deploy", description: "Discovered deploy" },
    ]);
  });
});
