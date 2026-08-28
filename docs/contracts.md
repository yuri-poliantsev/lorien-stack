# Contracts

Wire schema for roster, activity, presence hints, and wake. Schema version is `CONTRACTS_SCHEMA_VERSION` (`1`).

Presence is a hint. It is not lifecycle. A `PresenceHint` never says a bot is alive, dead, idle, or running. It only reports `lastActivityAt`, `freshnessMs`, and `reason`.

Spatial fields are optional so a 2D floor and a 3D room can share the same events. A bot with no `seatId` and no grid is valid.

## Layout on disk

Demo fixtures follow the Lauren `$AGENT_DATA` layout:

- `fixtures/demo/agents/<uuid>/profile.json`
- `fixtures/demo/agent-transcripts/<uuid>/<uuid>.jsonl`

`profile.json` is one object. `name` is required. `id` is a UUID and may be omitted; the directory name is then the id. Optional spatial fields are `seatId`, or `gridX` and `gridY` together.

JSONL is one object per line. Known `role` values are `user`, `assistant`, and `tool`. `parseActivityJsonl` skips a truncated last line and unknown roles. It does not throw for those cases.

## Wake payload

`parseWakeRequest` accepts an object:

```json
{
  "botId": "2b40667e-d345-4db1-bbf0-9b26b7f904e9",
  "prompt": "summarize the last hour"
}
```

`schemaVersion` is optional and must be `1` when present. Empty and whitespace-only `prompt` values fail closed: `{ ok: false, error }`.

## Exported types

### `BotId`

UUID branded string. Built by `parseBotId`.

### `SeatId`

Non-empty branded string. Built by `parseSeatId`.

### `EventId`

Non-empty branded string on `ActivityEvent.id`.

### `IsoTimestamp`

ISO-8601 instant with a timezone. Built by `parseIsoTimestamp`.

### `WakePrompt`

Trimmed non-empty branded string. Built only through `parseWakeRequest`.

### `SpatialAnchor`

`{ kind: "seat"; seatId: SeatId }` or `{ kind: "grid"; gridX: number; gridY: number }`. Absent when the bot or event has no placement.

### `BotRecord`

`id`, `name`, optional `spatial`.

### `RosterSnapshot`

`schemaVersion`, `capturedAt`, `bots`. Built by `parseRosterSnapshot`.

### `ActivityEvent`

Shared fields: `id`, `botId`, `at`, optional `spatial`. Role variants:

- `{ role: "user"; text }`
- `{ role: "assistant"; text }`
- `{ role: "tool"; toolName; text }`

JSONL wire fields: `role`, `content` or `text`, `at` or `timestamp`, optional `id`, optional `name` or `toolName` for tools, optional `seatId` or `gridX`/`gridY`. A missing timestamp becomes `1970-01-01T00:00:00.000Z`.

### `PresenceHint`

`lastActivityAt`, `freshnessMs`, `reason`. Built by `presenceHintFromQuietClock`. The quiet clock is wall time since last activity. `freshnessMs` is `max(0, now - lastActivityAt)`.

### `WakeRequest`

`schemaVersion`, `botId`, `prompt`. Built by `parseWakeRequest`.

### `ParseResult`

`{ ok: true; value }` or `{ ok: false; error }`. Returned by every parse helper.

## Exported values

### `CONTRACTS_SCHEMA_VERSION`

Literal `1`.

### `EXPORTED_TYPE_NAMES`

Runtime list of the exported type names, including `RosterSnapshot` and `WakeRequest`.

### `parseBotId`

Fails closed unless the input is a UUID.

### `parseSeatId`

Fails closed on a missing or blank string.

### `parseIsoTimestamp`

Fails closed unless the input matches ISO-8601 with a timezone.

### `parseBotRecord`

Parses one bot object into `BotRecord`.

### `parseAgentProfile`

Parses `profile.json`. Uses `fallbackId` when `id` is absent.

### `parseRosterSnapshot`

Parses a versioned roster object.

### `parseActivityJsonl`

Turns JSONL text plus `botId` into `ActivityEvent[]`. Skips blank lines, invalid JSON (including a truncated last line), unknown roles, and tool lines with no name.

### `parseWakeRequest`

Parses a wake payload. Empty prompt fails closed.

### `presenceHintFromQuietClock`

Builds a `PresenceHint` from `lastActivityAt`, `now`, and `reason`.
