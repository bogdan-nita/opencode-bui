#!/usr/bin/env bun

import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const repoRoot = resolve(currentDir, "..", "..");
const target = resolve(repoRoot, "packages", "opencode-bui-bridge", "src", "bin", "opencode-bui-bridge.ts");
const args = process.argv.slice(2);

const child = spawn("bun", [target, ...args], { stdio: "inherit" });
child.on("close", (code) => {
  process.exit(code ?? 0);
});
