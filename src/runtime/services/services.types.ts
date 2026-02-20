import { Context } from "effect";
import type { AgentStore } from "@bridge/agent-store.types";
import type { Clock } from "@bridge/clock.types";
import type { OpenCodeClient } from "@bridge/open-code-client.types";
import type { SessionStore } from "@bridge/session-store.types";

export class SessionStoreService extends Context.Tag("SessionStoreService")<SessionStoreService, SessionStore>() {}

export class AgentStoreService extends Context.Tag("AgentStoreService")<AgentStoreService, AgentStore>() {}

export class OpenCodeClientService extends Context.Tag("OpenCodeClientService")<OpenCodeClientService, OpenCodeClient>() {}

export class ClockService extends Context.Tag("ClockService")<ClockService, Clock>() {}
