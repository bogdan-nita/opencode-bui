# Core Runtime

## Layers

- `packages/opencode-bui-bridge/src/core/domain`: bridge-agnostic models (`BridgeId`, envelopes, refs, capabilities).
- `packages/opencode-bui-bridge/src/core/ports`: interface contracts only (adapters, stores, clients).
- `packages/opencode-bui-bridge/src/core/application`: orchestration (runtime, routing, backlog, health, bridge registry).
- `packages/opencode-bui-bridge/src/infra`: concrete implementations (config loader, runtime fs/process helpers, db, stores, lock, OpenCode client).
- `packages/opencode-bui-bridge/src/bridges/<name>`: bridge-specific edge adapters and bridge definitions.
- `packages/opencode-bui-bridge/src/bin`: bridge CLI entrypoints and onboarding.
- `packages/opencode-bui-plugin/src/plugin`: OpenCode plugin module and tool contract.

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
