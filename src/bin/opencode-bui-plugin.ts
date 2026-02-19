#!/usr/bin/env bun

import { resolve } from "node:path";
import { spawn } from "node:child_process";

const target = resolve(process.cwd(), "packages", "opencode-bui-plugin", "src", "bin", "opencode-bui-plugin.ts");
const args = process.argv.slice(2);

const child = spawn("bun", [target, ...args], { stdio: "inherit" });
child.on("close", (code) => {
  process.exit(code ?? 0);
});
