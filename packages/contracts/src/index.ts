export const CONTRACTS_SCHEMA_VERSION = 1 as const;

export type BotId = string & { readonly __brand: "BotId" };
export type SeatId = string & { readonly __brand: "SeatId" };
export type EventId = string & { readonly __brand: "EventId" };
export type IsoTimestamp = string & { readonly __brand: "IsoTimestamp" };

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

type GrokContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input?: unknown }
  | { type: "tool_result"; name?: string; result?: unknown };

type GrokTranscriptLine = {
  role: "user" | "assistant" | "tool";
  message: { content: string | GrokContentBlock[] };
};

export type PresenceHint = {
  lastActivityAt: IsoTimestamp;
  freshnessMs: number;
  reason: string;
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
] as const;

export const ACTIVITY_TOOL_TEXT_LIMIT = 400;

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

export function eventIdForJsonlLine(input: { botId: BotId; index: number }): EventId {
  return `${input.botId}:${input.index}` as EventId;
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

function parseGrokContentBlock(input: unknown): GrokContentBlock | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  switch (input.type) {
    case "text":
      if (typeof input.text !== "string") {
        return undefined;
      }
      return { type: "text", text: input.text };
    case "tool_use":
      if (typeof input.name !== "string") {
        return undefined;
      }
      return {
        type: "tool_use",
        name: input.name,
        ...(input.input !== undefined ? { input: input.input } : {}),
      };
    case "tool_result":
      if (input.name !== undefined && typeof input.name !== "string") {
        return undefined;
      }
      return {
        type: "tool_result",
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.result !== undefined ? { result: input.result } : {}),
      };
    default:
      return undefined;
  }
}

function parseGrokTranscriptLine(input: unknown): ParseResult<GrokTranscriptLine> {
  if (!isRecord(input)) {
    return fail("transcript line must be an object");
  }
  if (input.role !== "user" && input.role !== "assistant" && input.role !== "tool") {
    return fail("unsupported transcript role");
  }
  if (!isRecord(input.message)) {
    return fail("transcript message must be an object");
  }
  const content = input.message.content;
  if (typeof content === "string") {
    return {
      ok: true,
      value: { role: input.role, message: { content } },
    };
  }
  if (!Array.isArray(content)) {
    return fail("transcript content must be a string or array");
  }
  const blocks: GrokContentBlock[] = [];
  for (const block of content) {
    const parsed = parseGrokContentBlock(block);
    if (parsed !== undefined) {
      blocks.push(parsed);
    }
  }
  return {
    ok: true,
    value: { role: input.role, message: { content: blocks } },
  };
}

function compactJson(value: unknown): string {
  return (JSON.stringify(value) ?? "").slice(0, ACTIVITY_TOOL_TEXT_LIMIT);
}

type ActivityEventBase = Pick<ActivityEvent, "id" | "botId" | "at" | "spatial">;
type GrokBlockType = GrokContentBlock["type"];
type GrokBlockMapper<K extends GrokBlockType> = (
  block: Extract<GrokContentBlock, { type: K }>,
  line: GrokTranscriptLine,
  base: ActivityEventBase,
) => ActivityEvent | undefined;
type GrokBlockMappers = {
  [K in GrokBlockType]: GrokBlockMapper<K>;
};

const GROK_BLOCK_MAPPERS: GrokBlockMappers = {
  text(block, line, base) {
    if (line.role === "tool") {
      return undefined;
    }
    return { ...base, role: line.role, text: block.text };
  },
  tool_use(block, _line, base) {
    return {
      ...base,
      role: "tool",
      toolName: block.name,
      text: compactJson(block.input),
    };
  },
  tool_result(block, _line, base) {
    return {
      ...base,
      role: "tool",
      toolName: block.name ?? "unknown",
      text: compactJson(block.result),
    };
  },
};

function activityEventFromBlock(
  block: GrokContentBlock,
  line: GrokTranscriptLine,
  base: ActivityEventBase,
): ActivityEvent | undefined {
  const mapper = GROK_BLOCK_MAPPERS[block.type] as GrokBlockMapper<typeof block.type>;
  return mapper(block, line, base);
}

function activityEventFromUnknown(
  input: unknown,
  botId: BotId,
  index: number,
  at: IsoTimestamp,
): ActivityEvent | undefined {
  if (!isRecord(input)) {
    return undefined;
  }
  const line = parseGrokTranscriptLine(input);
  if (!line.ok) {
    return undefined;
  }
  const idResult =
    input.id === undefined
      ? { ok: true as const, value: eventIdForJsonlLine({ botId, index }) }
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
  const content =
    typeof line.value.message.content === "string"
      ? [{ type: "text" as const, text: line.value.message.content }]
      : line.value.message.content;
  for (const block of content) {
    const event = activityEventFromBlock(block, line.value, base);
    if (event !== undefined) {
      return event;
    }
  }
  return undefined;
}

export function parseActivityJsonl(input: {
  text: string;
  botId: BotId;
  lineOffset?: number;
  at: IsoTimestamp;
}): ActivityEvent[] {
  const lineOffset = input.lineOffset ?? 0;
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
    const event = activityEventFromUnknown(parsed, input.botId, lineOffset + index, input.at);
    if (event === undefined) {
      continue;
    }
    events.push(event);
  }
  return events;
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
