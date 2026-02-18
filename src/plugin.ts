import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { Bot } from "grammy";
import type { Plugin } from "@opencode-ai/plugin";

type OpencodeSessionId = string;

interface StoreShape {
  byChat: Record<string, OpencodeSessionId>;
}

interface ParsedCommand {
  name: string;
  args: string;
}

const DEFAULT_STORE_PATH = resolve(
  process.env.HOME ?? process.cwd(),
  ".config",
  "opencode",
  "plugins",
  "telegram-chat-sessions.json",
);

function loadEnvFiles(): void {
  const candidates = [
    process.env.TELEGRAM_PLUGIN_ENV,
    resolve(process.env.HOME ?? process.cwd(), ".config", "opencode", "plugins", ".env"),
    resolve(process.env.HOME ?? process.cwd(), "Desktop", "opencode-telegram-bot", ".env"),
    resolve(process.cwd(), ".env"),
  ].filter((value): value is string => Boolean(value));

  for (const envFile of candidates) {
    loadEnv({ path: envFile });
  }
}

function parseAllowedUsers(value: string | undefined): Set<number> {
  if (!value || value.trim().length === 0) {
    return new Set<number>();
  }

  return new Set(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => Number.parseInt(entry, 10))
      .filter((entry) => Number.isFinite(entry)),
  );
}

function parseCommand(text: string, botUsername?: string): ParsedCommand | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return undefined;
  }

  const body = trimmed.slice(1);
  if (body.length === 0) {
    return undefined;
  }

  const firstSpace = body.indexOf(" ");
  const rawName = firstSpace < 0 ? body : body.slice(0, firstSpace);
  const args = firstSpace < 0 ? "" : body.slice(firstSpace + 1).trim();

  let name = rawName;
  const atIndex = rawName.indexOf("@");
  if (atIndex > 0) {
    const commandTarget = rawName.slice(atIndex + 1);
    const normalizedTarget = commandTarget.toLowerCase();
    const normalizedBot = (botUsername ?? "").toLowerCase();
    if (!normalizedBot || normalizedTarget === normalizedBot) {
      name = rawName.slice(0, atIndex);
    }
  }

  return {
    name,
    args,
  };
}

async function readStore(filePath: string): Promise<StoreShape> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    return { byChat: parsed.byChat ?? {} };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ENOENT")) {
      return { byChat: {} };
    }
    throw error;
  }
}

async function writeStore(filePath: string, data: StoreShape): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    flag: "w",
  });
}

function extractSessionId(result: any): string | undefined {
  return (
    result?.data?.id ??
    result?.data?.info?.id ??
    result?.id ??
    result?.info?.id
  );
}

function collectTextParts(value: any): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectTextParts(item));
  }

  if (typeof value === "object") {
    const direct = value.type === "text" && typeof value.text === "string" ? [value.text] : [];
    return [
      ...direct,
      ...collectTextParts(value.part),
      ...collectTextParts(value.parts),
      ...collectTextParts(value.data),
      ...collectTextParts(value.output),
    ];
  }

  return [];
}

function splitTelegramMessage(text: string, max = 3900): string[] {
  if (text.length <= max) {
    return [text];
  }

  const chunks: string[] = [];
  let rest = text;

  while (rest.length > max) {
    let splitAt = rest.lastIndexOf("\n", max);
    if (splitAt <= 0) {
      splitAt = max;
    }
    chunks.push(rest.slice(0, splitAt));
    rest = rest.slice(splitAt).trimStart();
  }

  if (rest.length > 0) {
    chunks.push(rest);
  }

  return chunks;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatInlineMarkdownToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function formatPlainSegmentToHtml(segment: string): string {
  const lines = segment.split("\n");
  const rendered = lines.map((line) => {
    if (/^#{1,6}\s+/.test(line)) {
      return `<b>${formatInlineMarkdownToHtml(line.replace(/^#{1,6}\s+/, ""))}</b>`;
    }

    if (/^[-*]\s+/.test(line)) {
      return `• ${formatInlineMarkdownToHtml(line.replace(/^[-*]\s+/, ""))}`;
    }

    return formatInlineMarkdownToHtml(line);
  });

  return rendered.join("\n");
}

function formatTelegramHtml(text: string): string {
  const parts = text.split(/```/);
  const rendered = parts.map((part, index) => {
    if (index % 2 === 0) {
      return formatPlainSegmentToHtml(part);
    }

    const code = part.replace(/^\w+\n/, "");
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  });

  return rendered.join("");
}

async function sendPrettyMessage(bot: Bot, chatId: number, text: string): Promise<void> {
  for (const chunk of splitTelegramMessage(text)) {
    const html = formatTelegramHtml(chunk);
    try {
      await bot.api.sendMessage(chatId, html, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await bot.api.sendMessage(chatId, chunk, {
        link_preview_options: { is_disabled: true },
      });
    }
  }
}

export const TelegramBridgePlugin: Plugin = async ({ client }) => {
  loadEnvFiles();

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (botToken.length === 0) {
    await client.app.log({
      body: {
        service: "telegram-bridge",
        level: "warn",
        message: "TELEGRAM_BOT_TOKEN missing, plugin not started",
      },
    });
    return {};
  }

  const allowedUsers = parseAllowedUsers(process.env.TELEGRAM_ALLOWED_USER_IDS);
  const storePath = process.env.TELEGRAM_SESSION_STORE?.trim() || DEFAULT_STORE_PATH;

  const storeDir = dirname(storePath);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(storeDir, { recursive: true }));

  const bot = new Bot(botToken);
  const me = await bot.api.getMe();
  const botUsername = me.username ?? "";

  await bot.api.setMyCommands([
    { command: "start", description: "Show bot help" },
    { command: "session", description: "Show current OpenCode session" },
    { command: "resetchat", description: "Start a fresh session for this chat" },
    { command: "id", description: "Show Telegram IDs" },
    { command: "init", description: "Run OpenCode /init" },
    { command: "help", description: "Run OpenCode /help" },
    { command: "undo", description: "Run OpenCode /undo" },
    { command: "redo", description: "Run OpenCode /redo" },
  ]);

  const queueByChat = new Map<number, Promise<void>>();

  const enqueue = (chatId: number, task: () => Promise<void>): void => {
    const previous = queueByChat.get(chatId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    queueByChat.set(
      chatId,
      next.finally(() => {
        if (queueByChat.get(chatId) === next) {
          queueByChat.delete(chatId);
        }
      }),
    );
  };

  bot.on("message:text", async (ctx) => {
    const chatId = ctx.chat.id;
    const userId = ctx.from?.id;
    const text = ctx.message.text;

    if (!userId) {
      return;
    }

    if (allowedUsers.size > 0 && !allowedUsers.has(userId)) {
      await sendPrettyMessage(bot, chatId, "You are not allowed to use this bot.");
      return;
    }

    enqueue(chatId, async () => {
      await bot.api.sendChatAction(chatId, "typing");

      try {
        const store = await readStore(storePath);
        let sessionId = store.byChat[String(chatId)];
        const parsed = parseCommand(text, botUsername);

        if (parsed?.name === "start") {
          await sendPrettyMessage(
            bot,
            chatId,
            [
              "OpenCode Telegram plugin connected.",
              "",
              "- One Telegram chat = one OpenCode session",
              "- Plain text sends a prompt",
              "- Slash commands are forwarded (for example /init, /undo, /redo, /help)",
              "- /session shows current mapped OpenCode session",
              "- /resetchat clears mapping and starts a fresh session next message",
            ].join("\n"),
          );
          return;
        }

        if (parsed?.name === "session") {
          await sendPrettyMessage(
            bot,
            chatId,
            sessionId
              ? `Current OpenCode session: ${sessionId}`
              : "No mapped session yet for this chat.",
          );
          return;
        }

        if (parsed?.name === "id") {
          await sendPrettyMessage(
            bot,
            chatId,
            [
              `Bot username: @${botUsername || "unknown"}`,
              `Your user ID: ${userId}`,
              `This chat ID: ${chatId}`,
            ].join("\n"),
          );
          return;
        }

        if (parsed?.name === "resetchat") {
          delete store.byChat[String(chatId)];
          await writeStore(storePath, store);
          await sendPrettyMessage(bot, chatId, "Session mapping cleared for this chat.");
          return;
        }

        if (!sessionId) {
          const created = await client.session.create({
            body: { title: `Telegram chat ${chatId}` },
          } as any);
          const createdId = extractSessionId(created);
          if (!createdId) {
            throw new Error("Failed to create OpenCode session");
          }
          sessionId = createdId;
          store.byChat[String(chatId)] = sessionId;
          await writeStore(storePath, store);
        }

        let response: any;
        if (parsed) {
          response = await client.session.command({
            path: { id: sessionId },
            body: {
              command: parsed.name,
              args: parsed.args,
            },
          } as any);
        } else {
          response = await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text }],
            },
          } as any);
        }

        const outputText = collectTextParts(response).join("").trim();
        const finalText =
          outputText.length > 0
            ? outputText
            : parsed
              ? `Command /${parsed.name} executed.`
              : "OpenCode completed with no text output.";

        await sendPrettyMessage(bot, chatId, finalText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await sendPrettyMessage(bot, chatId, `Error: ${message}`);
      }
    });
  });

  bot.catch(async (error) => {
    const message = error.error instanceof Error ? error.error.message : String(error.error);
    await client.app.log({
      body: {
        service: "telegram-bridge",
        level: "error",
        message,
      },
    });
  });

  bot.start({ drop_pending_updates: true });

  await client.app.log({
    body: {
      service: "telegram-bridge",
      level: "info",
      message: `Telegram bridge plugin started (@${botUsername || "unknown"})`,
    },
  });

  return {};
};

export default TelegramBridgePlugin;
