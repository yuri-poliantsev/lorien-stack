import {
  parseBotId,
  parseIsoTimestamp,
  parseRosterSnapshot,
  type ActivityEvent,
  type BotId,
  type ParseResult,
  type PresenceHint,
  type RosterSnapshot,
} from "@lorien-stack/contracts";

export type ClientGatewayMessage =
  | { type: "snapshot"; revision: number; snapshot: RosterSnapshot }
  | { type: "event"; revision: number; event: ActivityEvent }
  | { type: "presence"; revision: number; botId: BotId; hint: PresenceHint };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function parseRevision(input: unknown): ParseResult<number> {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return fail("revision must be a finite number");
  }
  return { ok: true, value: input };
}

function parseEventId(input: unknown): ParseResult<ActivityEvent["id"]> {
  if (typeof input !== "string" || input.length === 0) {
    return fail("event id must be a non-empty string");
  }
  return { ok: true, value: input as ActivityEvent["id"] };
}

function parseActivityEvent(input: unknown): ParseResult<ActivityEvent> {
  if (!isRecord(input)) {
    return fail("event must be an object");
  }
  const botId = parseBotId(input.botId);
  if (!botId.ok) {
    return botId;
  }
  const id = parseEventId(input.id);
  if (!id.ok) {
    return id;
  }
  const at = parseIsoTimestamp(input.at);
  if (!at.ok) {
    return at;
  }
  const text = input.text;
  if (typeof text !== "string") {
    return fail("event text must be a string");
  }
  const role = input.role;
  const base = { id: id.value, botId: botId.value, at: at.value };
  if (role === "user") {
    return { ok: true, value: { ...base, role: "user", text } };
  }
  if (role === "assistant") {
    return { ok: true, value: { ...base, role: "assistant", text } };
  }
  if (role === "tool") {
    if (typeof input.toolName !== "string" || input.toolName.length === 0) {
      return fail("tool event needs toolName");
    }
    return {
      ok: true,
      value: { ...base, role: "tool", toolName: input.toolName, text },
    };
  }
  return fail("unknown event role");
}

function parsePresenceHint(input: unknown): ParseResult<PresenceHint> {
  if (!isRecord(input)) {
    return fail("presence hint must be an object");
  }
  const lastActivityAt = parseIsoTimestamp(input.lastActivityAt);
  if (!lastActivityAt.ok) {
    return lastActivityAt;
  }
  if (typeof input.freshnessMs !== "number" || !Number.isFinite(input.freshnessMs)) {
    return fail("freshnessMs must be a finite number");
  }
  if (typeof input.reason !== "string" || input.reason.length === 0) {
    return fail("reason must be a non-empty string");
  }
  return {
    ok: true,
    value: {
      lastActivityAt: lastActivityAt.value,
      freshnessMs: input.freshnessMs,
      reason: input.reason,
    },
  };
}

export function parseGatewayMessage(input: unknown): ParseResult<ClientGatewayMessage> {
  if (!isRecord(input)) {
    return fail("message must be an object");
  }
  const revision = parseRevision(input.revision);
  if (!revision.ok) {
    return revision;
  }
  if (input.type === "snapshot") {
    const snapshot = parseRosterSnapshot(input.snapshot);
    if (!snapshot.ok) {
      return snapshot;
    }
    return {
      ok: true,
      value: {
        type: "snapshot",
        revision: revision.value,
        snapshot: snapshot.value,
      },
    };
  }
  if (input.type === "event") {
    const event = parseActivityEvent(input.event);
    if (!event.ok) {
      return event;
    }
    return {
      ok: true,
      value: { type: "event", revision: revision.value, event: event.value },
    };
  }
  if (input.type === "presence") {
    const botId = parseBotId(input.botId);
    if (!botId.ok) {
      return botId;
    }
    const hint = parsePresenceHint(input.hint);
    if (!hint.ok) {
      return hint;
    }
    return {
      ok: true,
      value: {
        type: "presence",
        revision: revision.value,
        botId: botId.value,
        hint: hint.value,
      },
    };
  }
  return fail("unknown gateway message type");
}

export function gatewayWsUrl(input: { protocol: string; host: string }): string {
  const wsProtocol = input.protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${input.host}/ws`;
}

export type GatewayConnection = {
  close: () => void;
};

export function connectGateway(input: {
  url: string;
  onMessage: (message: ClientGatewayMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}): GatewayConnection {
  const socket = new WebSocket(input.url);
  socket.addEventListener("open", () => {
    input.onOpen?.();
  });
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }
    const message = parseGatewayMessage(parsed);
    if (!message.ok) {
      return;
    }
    input.onMessage(message.value);
  });
  socket.addEventListener("close", () => {
    input.onClose?.();
  });
  return {
    close() {
      socket.close();
    },
  };
}
