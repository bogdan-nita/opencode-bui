export interface Clock {
  nowUnixSeconds(): number;
  nowIso(): string;
}
