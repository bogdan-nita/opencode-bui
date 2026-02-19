export async function fileExists(path: string): Promise<boolean> {
  if (typeof Bun !== "undefined") {
    const result = await Bun.$`test -e ${path}`.quiet().nothrow();
    return result.exitCode === 0;
  }

  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.$`mkdir -p ${path}`;
    return;
  }

  const { mkdir } = await import("node:fs/promises");
  await mkdir(path, { recursive: true });
}

export async function readTextFile(path: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    return await Bun.file(path).text();
  }

  const { readFile } = await import("node:fs/promises");
  return await readFile(path, "utf8");
}

export async function readDir(path: string): Promise<string[]> {
  const { readdir } = await import("node:fs/promises");
  return await readdir(path, { withFileTypes: false });
}

export async function writeTextFile(path: string, text: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, text);
    return;
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, text, "utf8");
}

export async function writeBytesFile(path: string, bytes: Uint8Array): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, bytes);
    return;
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, bytes);
}

export async function copyFile(sourcePath: string, destinationPath: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(destinationPath, Bun.file(sourcePath));
    return;
  }

  const { copyFile: nodeCopyFile } = await import("node:fs/promises");
  await nodeCopyFile(sourcePath, destinationPath);
}

export async function moveFile(sourcePath: string, destinationPath: string): Promise<void> {
  const { rename } = await import("node:fs/promises");
  await rename(sourcePath, destinationPath);
}
