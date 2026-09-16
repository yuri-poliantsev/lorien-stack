const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function ageLabel(ageMs: number | undefined): string {
  if (ageMs === undefined || !Number.isFinite(ageMs)) {
    return "\u2013";
  }
  const ms = Math.max(0, ageMs);
  if (ms < 5_000) {
    return "now";
  }
  if (ms < MINUTE_MS) {
    return `${Math.floor(ms / 1000)}s`;
  }
  if (ms < HOUR_MS) {
    return `${Math.floor(ms / MINUTE_MS)}m`;
  }
  if (ms < DAY_MS) {
    return `${Math.floor(ms / HOUR_MS)}h`;
  }
  return `${Math.floor(ms / DAY_MS)}d`;
}

export function timeLabel(at: string): string {
  const ms = Date.parse(at);
  if (Number.isNaN(ms)) {
    return "\u2013";
  }
  return new Date(ms).toTimeString().slice(0, 8);
}

export function countLabel(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  return String(Math.max(0, Math.round(value)));
}
