import type { Client } from "discord.js";
import { logger } from "@infra/logger";

/**
 * Generates a unique key for tracking typing intervals per conversation.
 */
export function typingKey(conversation: { bridgeId: string; channelId: string; threadId?: string }): string {
  return `${conversation.bridgeId}:${conversation.channelId}:${conversation.threadId || ""}`;
}

/**
 * Creates a typing indicator manager for Discord channels.
 */
export function createTypingManager(client: Client) {
  const typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  return {
    /**
     * Starts the typing indicator for a channel and returns a stop function.
     */
    async beginTyping(conversation: { bridgeId: string; channelId: string; threadId?: string }): Promise<() => Promise<void>> {
      const channel = await client.channels.fetch(conversation.channelId);
      if (!channel || !channel.isTextBased() || !("sendTyping" in channel) || typeof channel.sendTyping !== "function") {
        throw new Error(`Discord channel does not support typing indicator: ${conversation.channelId}`);
      }

      const key = typingKey(conversation);
      const sendTyping = async () => {
        try {
          await channel.sendTyping();
        } catch (error) {
          logger.warn({ error, channelId: conversation.channelId }, "[bui] Discord typing action failed.");
        }
      };

      await sendTyping();
      const interval = setInterval(() => {
        void sendTyping();
      }, 7000);
      typingIntervals.set(key, interval);

      return async () => {
        const existing = typingIntervals.get(key);
        if (existing) {
          clearInterval(existing);
          typingIntervals.delete(key);
        }
      };
    },

    /**
     * Stops all active typing indicators.
     */
    stopAll(): void {
      for (const timer of typingIntervals.values()) {
        clearInterval(timer);
      }
      typingIntervals.clear();
    },
  };
}
