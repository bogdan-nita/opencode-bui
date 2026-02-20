import { Context } from "effect";
import type { AgentStore, Clock, OpenCodeClient, SessionStore } from "@runtime/bridge/types";

export class SessionStoreService extends Context.Tag("SessionStoreService")<SessionStoreService, SessionStore>() {}

export class AgentStoreService extends Context.Tag("AgentStoreService")<AgentStoreService, AgentStore>() {}

export class OpenCodeClientService extends Context.Tag("OpenCodeClientService")<OpenCodeClientService, OpenCodeClient>() {}

export class ClockService extends Context.Tag("ClockService")<ClockService, Clock>() {}
