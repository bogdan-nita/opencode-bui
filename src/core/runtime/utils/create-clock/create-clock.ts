import { createSystemClock } from "@infra/time/system-clock";
import type { Clock } from "@bridge/types";

export function createClock(): Clock {
  return createSystemClock();
}
