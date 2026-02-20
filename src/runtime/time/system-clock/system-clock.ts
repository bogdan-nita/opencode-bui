import { formatISO } from "date-fns";
import type { Clock } from "@runtime/bridge/types";

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
