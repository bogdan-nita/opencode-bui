import type { Clock } from "../../core/ports/clock.types.js";
import { formatISO } from "date-fns";

export function createSystemClock(): Clock {
  return {
    nowUnixSeconds() {
      return Math.floor(Date.now() / 1000);
    },
    nowIso() {
      return formatISO(new Date());
    },
  };
}
