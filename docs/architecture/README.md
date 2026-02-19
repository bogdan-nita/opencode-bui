# Architecture and Implementation

This section explains how `opencode-bui` is structured and where implementation responsibilities live.

- `docs/architecture/core-runtime.md`: runtime layers, flow, and orchestration boundaries.
- `docs/architecture/bridges.md`: bridge definition contract and bridge ownership model.
- `docs/architecture/storage.md`: LibSQL + Drizzle model, paths, and migration workflow.

Design rule: core orchestrates shared behavior; bridge-specific behavior is owned by each bridge definition.
