import { createRuntimeState } from "@core/state/runtime-state";
import type { RuntimeState } from "@core/state/runtime-state.types";

export function createState(): RuntimeState {
  return createRuntimeState();
}
