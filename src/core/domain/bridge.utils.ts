export function isSlashCommand(text: string): boolean {
  return text.trimStart().startsWith("/");
}

export function splitCommand(raw: string): { command: string; args: string } {
  const trimmed = raw.trim();
  const normalized = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  const firstSpace = normalized.indexOf(" ");
  if (firstSpace < 0) {
    return { command: normalized.toLowerCase(), args: "" };
  }

  return {
    command: normalized.slice(0, firstSpace).toLowerCase(),
    args: normalized.slice(firstSpace + 1).trim(),
  };
}

export function splitLongText(text: string, max = 3900): string[] {
  if (text.length <= max) {
    return [text];
  }

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cutAt = rest.lastIndexOf("\n", max);
    if (cutAt <= 0) {
      cutAt = max;
    }
    chunks.push(rest.slice(0, cutAt));
    rest = rest.slice(cutAt).trimStart();
  }
  if (rest.length) {
    chunks.push(rest);
  }
  return chunks;
}
