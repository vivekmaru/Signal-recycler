export function compactId(id: string): string {
  const [prefix, value] = id.split("_");
  if (!value) return id.length > 10 ? `${id.slice(0, 10)}…` : id;
  return `${prefix}_${value.slice(0, 6)}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export function formatDuration(start: string, end?: string): string {
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes === 0) return `${remainder}s`;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

export function formatTokenDelta(value: number): string {
  if (value === 0) return "0";
  const sign = value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  const formatted = absolute >= 1000 ? `${(absolute / 1000).toFixed(1)}k` : String(absolute);
  return `${sign}${value < 0 ? "-" : ""}${formatted}`;
}
