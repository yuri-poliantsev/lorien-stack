# Contracts

Wire schema for roster, activity, and presence hints. Schema version is `CONTRACTS_SCHEMA_VERSION` (`1`).

Presence is a hint. It is not lifecycle. A `PresenceHint` never says a bot is alive, dead, idle, or running. It only reports `lastActivityAt`, `freshnessMs`, and `reason`.

Spatial fields are optional so a 2D floor and a 3D room can share the same events. A bot with no `seatId` and no grid is valid.

## Layout on disk

Demo fixtures follow the Grok Bot `$AGENT_DATA` layout:

- `fixtures/demo/agents/<uuid>/profile.json`
- `fixtures/demo/agent-transcripts/<uuid>/<uuid>.jsonl`

`profile.json` is one object. `name` is required. `id` is a UUID and may be omitted; the directory name is then the id. Optional spatial fields are `seatId`, or `gridX` and `gridY` together.

JSONL is one object per line. Known `role` values are `user`, `assistant`, and `tool`. Each line has `message.content` as a string or an array of `text`, `tool_use`, and `tool_result` blocks. `parseActivityJsonl` skips a truncated last line, unknown roles, and lines with no mappable block. It does not throw for those cases.

## Exported types

### `BotId`

UUID branded string. Built by `parseBotId`.

### `SeatId`

Non-empty branded string. Built by `parseSeatId`.

### `EventId`

Non-empty branded string on `ActivityEvent.id`.

### `IsoTimestamp`

ISO-8601 instant with a timezone. Built by `parseIsoTimestamp`.

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

JSONL wire fields are `role` and `message.content`. String content maps to text. Array content uses `{ type: "text", text }`, `{ type: "tool_use", name, input }`, or `{ type: "tool_result", name, result }` blocks. The first mappable block becomes the event. Optional top-level fields are `id`, `seatId`, or `gridX` and `gridY`. A line with no `id` uses `eventIdForJsonlLine({ botId, index })`. `parseActivityJsonl` takes the event time from its required `at` argument and ignores top-level `at` and `timestamp` fields.

### `PresenceHint`

`lastActivityAt`, `freshnessMs`, `reason`. Built by `presenceHintFromQuietClock`. The quiet clock is wall time since last activity. `freshnessMs` is `max(0, now - lastActivityAt)`.

### `ParseResult`

`{ ok: true; value }` or `{ ok: false; error }`. Returned by every parse helper.

## Exported values

### `CONTRACTS_SCHEMA_VERSION`

Literal `1`.

### `EXPORTED_TYPE_NAMES`

Runtime list of the exported type names, including `RosterSnapshot`.

### `ACTIVITY_TOOL_TEXT_LIMIT`

Maximum length of compact JSON text from a `tool_use` input or a `tool_result` result. The limit is 400 characters.

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

### `eventIdForJsonlLine`

Builds `EventId` as `<botId>:<index>` when a JSONL line has no `id`.

### `parseActivityJsonl`

Turns JSONL text plus `botId` and a caller-supplied `at` into `ActivityEvent[]`. Skips blank lines, invalid JSON (including a truncated last line), unknown roles, and lines with no mappable content block.

### `presenceHintFromQuietClock`

Builds a `PresenceHint` from `lastActivityAt`, `now`, and `reason`.
