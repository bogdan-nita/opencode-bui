# Core Runtime

## Layers

- `src/core/domain`: bridge-agnostic models (`BridgeId`, envelopes, refs, capabilities).
- `src/core/ports`: interface contracts only (adapters, stores, clients).
- `src/core/application`: orchestration (runtime, routing, backlog, health, bridge registry).
- `src/infra`: concrete implementations (config loader, runtime fs/process helpers, db, stores, lock, OpenCode client).
- `src/bridges/<name>`: bridge-specific edge adapters and bridge definitions.
- `src/bin`: bridge CLI entrypoints and onboarding.
- `src/plugin`: OpenCode plugin module and tool contract.

## Runtime flow

1. CLI resolves config.
2. Registry builds enabled bridge adapters.
3. Runtime starts all bridges concurrently.
4. Inbound envelopes are routed through shared command/backlog/media pipeline.
5. Outbound envelopes are rendered and sent by each bridge adapter.

## Shared contracts

- Bridge adapter: `start`, `stop`, `send`, `setCommands`, `health`.
- Bridge definition: `assertConfigured`, `healthcheck`, `runtimePolicy`, `onboarding`, `createAdapter`.

Core must not branch on bridge type for business policy.
