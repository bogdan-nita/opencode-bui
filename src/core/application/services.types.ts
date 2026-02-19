import { Context } from "effect";
import type { AgentStore } from "../ports/agent-store.types.js";
import type { Clock } from "../ports/clock.types.js";
import type { OpenCodeClient } from "../ports/open-code-client.types.js";
import type { SessionStore } from "../ports/session-store.types.js";

export class SessionStoreService extends Context.Tag("SessionStoreService")<SessionStoreService, SessionStore>() {}

export class AgentStoreService extends Context.Tag("AgentStoreService")<AgentStoreService, AgentStore>() {}

export class OpenCodeClientService extends Context.Tag("OpenCodeClientService")<OpenCodeClientService, OpenCodeClient>() {}

export class ClockService extends Context.Tag("ClockService")<ClockService, Clock>() {}
