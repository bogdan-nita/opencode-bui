import { resolve } from "node:path";
import { format } from "date-fns";
import { ensureDir } from "@infra/runtime/runtime-fs";
import { runProcess } from "@infra/runtime/runtime-process";
import type { ScreenshotRequest } from "./media-coordinator.types";

type ScreenshotCommand = {
  label: string;
  argv: string[];
};

function detectScreenshotCommands(destination: string): ScreenshotCommand[] {
  if (process.platform === "darwin") {
    return [
      {
        label: "macOS screencapture",
        argv: ["/usr/sbin/screencapture", "-x", destination],
      },
    ];
  }

  if (process.platform === "linux") {
    return [
      {
        label: "grim",
        argv: ["grim", destination],
      },
      {
        label: "gnome-screenshot",
        argv: ["gnome-screenshot", "-f", destination],
      },
      {
        label: "imagemagick import",
        argv: ["import", "-window", "root", destination],
      },
    ];
  }

  if (process.platform === "win32") {
    const escapedDestination = destination.replaceAll("'", "''");
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "Add-Type -AssemblyName System.Drawing;",
      "$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;",
      "$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;",
      "$graphics = [System.Drawing.Graphics]::FromImage($bitmap);",
      "$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);",
      `$bitmap.Save('${escapedDestination}', [System.Drawing.Imaging.ImageFormat]::Png);`,
      "$graphics.Dispose();",
      "$bitmap.Dispose();",
    ].join(" ");

    return [
      {
        label: "powershell CopyFromScreen",
        argv: ["powershell", "-NoProfile", "-Command", script],
      },
    ];
  }

  return [];
}

async function captureWithFallbacks(commands: ScreenshotCommand[]): Promise<void> {
  const failures: string[] = [];
  for (const command of commands) {
    const result = await runProcess(command.argv, { timeoutMs: 15000 });
    if (result.code === 0) {
      return;
    }

    const reason = result.stderr.trim() || result.stdout.trim() || (result.timedOut ? "timed out" : `exit ${result.code}`);
    failures.push(`${command.label}: ${reason}`);
  }

  throw new Error(
    [
      "Could not capture screenshot with available tools.",
      ...failures.map((line) => `- ${line}`),
      "Install one supported screenshot tool for your OS or grant required permissions.",
    ].join("\n"),
  );
}

export async function captureScreenshot(uploadRoot: string, input: ScreenshotRequest): Promise<string> {
  const stamp = format(new Date(), "yyyyMMdd-HHmmss");
  const safeNote = input.note ? input.note.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 24) : "";
  const directory = resolve(uploadRoot, input.conversationId);
  await ensureDir(directory);
  const destination = resolve(directory, `screenshot-${stamp}${safeNote ? `-${safeNote}` : ""}.png`);
  const commands = detectScreenshotCommands(destination);
  if (commands.length === 0) {
    throw new Error(`Screenshot capture is not supported on platform: ${process.platform}`);
  }

  await captureWithFallbacks(commands);
  return destination;
}

export type { ScreenshotRequest } from "./media-coordinator.types";
