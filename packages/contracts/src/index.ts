export const CONTRACTS_SCHEMA_VERSION = 1 as const;

export type BotId = string & { readonly __brand: "BotId" };
export type SeatId = string & { readonly __brand: "SeatId" };
export type EventId = string & { readonly __brand: "EventId" };
export type IsoTimestamp = string & { readonly __brand: "IsoTimestamp" };
export type WakePrompt = string & { readonly __brand: "WakePrompt" };

export type SpatialAnchor =
  | { kind: "seat"; seatId: SeatId }
  | { kind: "grid"; gridX: number; gridY: number };

export type BotRecord = {
  id: BotId;
  name: string;
  spatial?: SpatialAnchor;
};

export type RosterSnapshot = {
  schemaVersion: typeof CONTRACTS_SCHEMA_VERSION;
  capturedAt: IsoTimestamp;
  bots: BotRecord[];
};

export type ActivityEvent = {
  id: EventId;
  botId: BotId;
  at: IsoTimestamp;
  spatial?: SpatialAnchor;
} & (
  | { role: "user"; text: string }
  | { role: "assistant"; text: string }
  | { role: "tool"; toolName: string; text: string }
);

export type PresenceHint = {
  lastActivityAt: IsoTimestamp;
  freshnessMs: number;
  reason: string;
};

export type WakeRequest = {
  schemaVersion: typeof CONTRACTS_SCHEMA_VERSION;
  botId: BotId;
  prompt: WakePrompt;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export const EXPORTED_TYPE_NAMES = [
  "ActivityEvent",
  "BotId",
  "BotRecord",
  "EventId",
  "IsoTimestamp",
  "ParseResult",
  "PresenceHint",
  "RosterSnapshot",
  "SeatId",
  "SpatialAnchor",
  "WakePrompt",
  "WakeRequest",
] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function parseBotId(input: unknown): ParseResult<BotId> {
  if (typeof input !== "string" || !UUID_RE.test(input)) {
    return fail("botId must be a UUID");
  }
  return { ok: true, value: input as BotId };
}

export function parseSeatId(input: unknown): ParseResult<SeatId> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return fail("seatId must be a non-empty string");
  }
  return { ok: true, value: input as SeatId };
}

export function parseIsoTimestamp(input: unknown): ParseResult<IsoTimestamp> {
  if (typeof input !== "string" || !ISO_RE.test(input)) {
    return fail("timestamp must be ISO-8601");
  }
  if (!Number.isFinite(Date.parse(input))) {
    return fail("timestamp must be ISO-8601");
  }
  return { ok: true, value: input as IsoTimestamp };
}

function parseEventId(input: unknown): ParseResult<EventId> {
  if (typeof input !== "string" || input.length === 0) {
    return fail("event id must be a non-empty string");
  }
  return { ok: true, value: input as EventId };
}

function parseName(input: unknown): ParseResult<string> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return fail("name must be a non-empty string");
  }
  return { ok: true, value: input };
}

function parseFiniteNumber(input: unknown, field: string): ParseResult<number> {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fail(`${field} must be a finite number`);
  }
  return { ok: true, value: input };
}

function parseSpatial(input: Record<string, unknown>): ParseResult<SpatialAnchor | undefined> {
  const hasSeat = input.seatId !== undefined;
  const hasGridX = input.gridX !== undefined;
  const hasGridY = input.gridY !== undefined;
  if (hasSeat) {
    const seatId = parseSeatId(input.seatId);
    if (!seatId.ok) {
      return seatId;
    }
    return { ok: true, value: { kind: "seat", seatId: seatId.value } };
  }
  if (hasGridX || hasGridY) {
    const gridX = parseFiniteNumber(input.gridX, "gridX");
    if (!gridX.ok) {
      return gridX;
    }
    const gridY = parseFiniteNumber(input.gridY, "gridY");
    if (!gridY.ok) {
      return gridY;
    }
    return { ok: true, value: { kind: "grid", gridX: gridX.value, gridY: gridY.value } };
  }
  return { ok: true, value: undefined };
}

export function parseBotRecord(input: unknown): ParseResult<BotRecord> {
  if (!isRecord(input)) {
    return fail("bot record must be an object");
  }
  const id = parseBotId(input.id);
  if (!id.ok) {
    return id;
  }
  const name = parseName(input.name);
  if (!name.ok) {
    return name;
  }
  const spatial = parseSpatial(input);
  if (!spatial.ok) {
    return spatial;
  }
  const record: BotRecord = { id: id.value, name: name.value };
  if (spatial.value !== undefined) {
    record.spatial = spatial.value;
  }
  return { ok: true, value: record };
}

export function parseAgentProfile(
  input: unknown,
  fallbackId: string,
): ParseResult<BotRecord> {
  if (!isRecord(input)) {
    return fail("profile must be an object");
  }
  const rawId = input.id === undefined ? fallbackId : input.id;
  return parseBotRecord({ ...input, id: rawId });
}

export function parseRosterSnapshot(input: unknown): ParseResult<RosterSnapshot> {
  if (!isRecord(input)) {
    return fail("roster snapshot must be an object");
  }
  if (input.schemaVersion !== CONTRACTS_SCHEMA_VERSION) {
    return fail("unsupported schemaVersion");
  }
  const capturedAt = parseIsoTimestamp(input.capturedAt);
  if (!capturedAt.ok) {
    return capturedAt;
  }
  if (!Array.isArray(input.bots)) {
    return fail("bots must be an array");
  }
  const bots: BotRecord[] = [];
  for (const bot of input.bots) {
    const parsed = parseBotRecord(bot);
    if (!parsed.ok) {
      return parsed;
    }
    bots.push(parsed.value);
  }
  return {
    ok: true,
    value: {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      capturedAt: capturedAt.value,
      bots,
    },
  };
}

function parseJsonLine(line: string): unknown | undefined {
  try {
    return JSON.parse(line) as unknown;
  } catch {
    return undefined;
  }
}

function textFromWire(input: Record<string, unknown>): string | undefined {
  if (typeof input.content === "string") {
    return input.content;
  }
  if (typeof input.text === "string") {
    return input.text;
  }
  return undefined;
}

function toolNameFromWire(input: Record<string, unknown>): string | undefined {
  if (typeof input.name === "string" && input.name.length > 0) {
    return input.name;
  }
  if (typeof input.toolName === "string" && input.toolName.length > 0) {
    return input.toolName;
  }
  return undefined;
}

function timestampFromWire(input: Record<string, unknown>): ParseResult<IsoTimestamp> | undefined {
  if (input.at !== undefined) {
    return parseIsoTimestamp(input.at);
  }
  if (input.timestamp !== undefined) {
    return parseIsoTimestamp(input.timestamp);
  }
  return undefined;
}

function activityEventFromUnknown(
  input: unknown,
  botId: BotId,
  index: number,
): ActivityEvent | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const role = input.role;
  if (role !== "user" && role !== "assistant" && role !== "tool") {
    return undefined;
  }
  const text = textFromWire(input);
  if (text === undefined) {
    return undefined;
  }
  const atResult = timestampFromWire(input);
  if (atResult !== undefined && !atResult.ok) {
    return undefined;
  }
  const at =
    atResult?.ok === true
      ? atResult.value
      : ("1970-01-01T00:00:00.000Z" as IsoTimestamp);
  const idResult =
    input.id === undefined
      ? parseEventId(`${botId}:${index}`)
      : parseEventId(input.id);
  if (!idResult.ok) {
    return undefined;
  }
  const spatial = parseSpatial(input);
  if (!spatial.ok) {
    return undefined;
  }
  const base = {
    id: idResult.value,
    botId,
    at,
    ...(spatial.value !== undefined ? { spatial: spatial.value } : {}),
  };
  switch (role) {
    case "user":
      return { ...base, role: "user", text };
    case "assistant":
      return { ...base, role: "assistant", text };
    case "tool": {
      const toolName = toolNameFromWire(input);
      if (toolName === undefined) {
        return undefined;
      }
      return { ...base, role: "tool", toolName, text };
    }
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function parseActivityJsonl(input: { text: string; botId: BotId }): ActivityEvent[] {
  const rawLines = input.text.split("\n");
  if (rawLines.at(-1) === "") {
    rawLines.pop();
  }
  const events: ActivityEvent[] = [];
  for (let index = 0; index < rawLines.length; index += 1) {
    const line = rawLines[index];
    if (line === undefined || line.trim() === "") {
      continue;
    }
    const parsed = parseJsonLine(line);
    if (parsed === undefined) {
      continue;
    }
    const event = activityEventFromUnknown(parsed, input.botId, index);
    if (event === undefined) {
      continue;
    }
    events.push(event);
  }
  return events;
}

function parseWakePrompt(input: unknown): ParseResult<WakePrompt> {
  if (typeof input !== "string") {
    return fail("prompt must be a non-empty string");
  }
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return fail("prompt must be a non-empty string");
  }
  return { ok: true, value: trimmed as WakePrompt };
}

export function parseWakeRequest(input: unknown): ParseResult<WakeRequest> {
  if (!isRecord(input)) {
    return fail("wake request must be an object");
  }
  const botId = parseBotId(input.botId);
  if (!botId.ok) {
    return botId;
  }
  const prompt = parseWakePrompt(input.prompt);
  if (!prompt.ok) {
    return prompt;
  }
  if (
    input.schemaVersion !== undefined &&
    input.schemaVersion !== CONTRACTS_SCHEMA_VERSION
  ) {
    return fail("unsupported schemaVersion");
  }
  return {
    ok: true,
    value: {
      schemaVersion: CONTRACTS_SCHEMA_VERSION,
      botId: botId.value,
      prompt: prompt.value,
    },
  };
}

export function presenceHintFromQuietClock(input: {
  lastActivityAt: IsoTimestamp;
  now: IsoTimestamp;
  reason: string;
}): PresenceHint {
  const lastMs = Date.parse(input.lastActivityAt);
  const nowMs = Date.parse(input.now);
  return {
    lastActivityAt: input.lastActivityAt,
    freshnessMs: Math.max(0, nowMs - lastMs),
    reason: input.reason,
  };
}
