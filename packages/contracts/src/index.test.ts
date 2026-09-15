import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPORTED_TYPE_NAMES,
  parseActivityJsonl,
  parseAgentProfile,
  parseBotId,
  parseIsoTimestamp,
  presenceHintFromQuietClock,
  type ActivityEvent,
  type BotRecord,
} from "./index.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const demoRoot = path.join(repoRoot, "fixtures/demo");
const agentsRoot = path.join(demoRoot, "agents");
const transcriptsRoot = path.join(demoRoot, "agent-transcripts");
const docsPath = path.join(repoRoot, "docs/contracts.md");
const sourcePath = fileURLToPath(new URL("./index.ts", import.meta.url));

function listAgentIds(): string[] {
  return readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readProfile(botId: string): unknown {
  const raw = readFileSync(path.join(agentsRoot, botId, "profile.json"), "utf8");
  return JSON.parse(raw) as unknown;
}

function readTranscript(botId: string): { file: string; text: string } {
  const dir = path.join(transcriptsRoot, botId);
  const files = readdirSync(dir).filter((name) => name.endsWith(".jsonl"));
  assert.ok(files.length >= 1, `expected jsonl for ${botId}`);
  const file = files[0];
  assert.ok(file !== undefined);
  return { file, text: readFileSync(path.join(dir, file), "utf8") };
}

function exportedNamesFromSource(source: string): string[] {
  const names = new Set<string>();
  const typeRe = /^export type (\w+)/gm;
  for (const match of source.matchAll(typeRe)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return [...names].sort();
}

function exportedValueNamesFromSource(source: string): string[] {
  const names = new Set<string>();
  const re = /^export (?:function|const) (\w+)/gm;
  for (const match of source.matchAll(re)) {
    const name = match[1];
    if (name !== undefined) {
      names.add(name);
    }
  }
  return [...names].sort();
}

describe("demo fixtures", () => {
  it("parses fixture JSONL into ActivityEvent", () => {
    const ids = listAgentIds();
    assert.ok(ids.length >= 8);
    for (const id of ids) {
      const botId = parseBotId(id);
      assert.equal(botId.ok, true);
      if (!botId.ok) {
        continue;
      }
      const { text } = readTranscript(id);
      const at = parseIsoTimestamp("2026-08-27T09:00:00.000Z");
      assert.equal(at.ok, true);
      if (!at.ok) {
        continue;
      }
      const events: ActivityEvent[] = parseActivityJsonl({
        text,
        botId: botId.value,
        at: at.value,
      });
      assert.ok(events.length >= 1, `expected activity for ${id}`);
      for (const event of events) {
        assert.equal(event.botId, botId.value);
        assert.ok(event.role === "user" || event.role === "assistant" || event.role === "tool");
      }
    }
  });

  it("parses every demo profile with a name", () => {
    const ids = listAgentIds();
    assert.ok(ids.length >= 8);
    for (const id of ids) {
      const parsed = parseAgentProfile(readProfile(id), id);
      assert.equal(parsed.ok, true, `profile ${id}`);
      if (!parsed.ok) {
        continue;
      }
      assert.ok(parsed.value.name.length > 0);
      assert.equal(parsed.value.id, id);
    }
  });
});

describe("jsonl edge parse", () => {
  const botIdResult = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
  assert.equal(botIdResult.ok, true);
  if (!botIdResult.ok) {
    throw new Error("fixture bot id");
  }
  const botId = botIdResult.value;
  const atResult = parseIsoTimestamp("2026-08-20T10:00:00.000Z");
  assert.equal(atResult.ok, true);
  if (!atResult.ok) {
    throw new Error("fixture timestamp");
  }
  const at = atResult.value;

  it("parses real Grok transcript lines", () => {
    const text = [
      `{"role":"tool","message":{"content":[{"type":"tool_result","name":"communicate_update","result":{"success":{"currentStep":"..."}}}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"tool_use","id":"tu1","name":"shell","input":{"command":"echo 4"}}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"text","text":"4"}]}}`,
      `{"role":"user","message":{"content":"plain string is also possible"}}`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId, at });
    assert.deepEqual(
      events.map((event) => [
        event.role,
        event.role === "tool" ? event.toolName : undefined,
        event.text,
        event.at,
      ]),
      [
        ["tool", "communicate_update", `{"success":{"currentStep":"..."}}`, at],
        ["tool", "shell", `{"command":"echo 4"}`, at],
        ["assistant", undefined, "4", at],
        ["user", undefined, "plain string is also possible", at],
      ],
    );
  });

  it("skips unknown block types and keeps the first mappable block", () => {
    const text = [
      `{"role":"assistant","message":{"content":[{"type":"thinking","thinking":"hmm"},{"type":"text","text":"after thinking"}]}}`,
      `{"role":"user","message":{"content":[{"type":"image","source":{}},{"type":"text","text":"see attached"}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"thinking","thinking":"only"}]}}`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId, at });
    assert.deepEqual(
      events.map((event) => [event.role, event.text]),
      [
        ["assistant", "after thinking"],
        ["user", "see attached"],
      ],
    );
  });

  it("rejects unknown roles without throwing", () => {
    const text = [
      `{"role":"user","message":{"content":[{"type":"text","text":"hello"}]}}`,
      `{"role":"system","message":{"content":[{"type":"text","text":"ignore me"}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"text","text":"hi"}]}}`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId, at });
    assert.deepEqual(
      events.map((event) => [event.role, event.text]),
      [
        ["user", "hello"],
        ["assistant", "hi"],
      ],
    );
  });

  it("skips a truncated last line and keeps prior events", () => {
    const text = [
      `{"role":"user","message":{"content":[{"type":"text","text":"keep me"}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"text","text":"also keep"}]}}`,
      `{"role":"assistant","message":{"content":[{"type":"text","text":"cut`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId, at });
    assert.deepEqual(
      events.map((event) => [event.role, event.text]),
      [
        ["user", "keep me"],
        ["assistant", "also keep"],
      ],
    );
  });
});

describe("presence", () => {
  it("builds PresenceHint from the quiet clock", () => {
    const last = parseIsoTimestamp("2026-08-20T10:00:00.000Z");
    const now = parseIsoTimestamp("2026-08-20T10:00:05.000Z");
    assert.equal(last.ok, true);
    assert.equal(now.ok, true);
    if (!last.ok || !now.ok) {
      return;
    }
    const hint = presenceHintFromQuietClock({
      lastActivityAt: last.value,
      now: now.value,
      reason: "no new transcript lines",
    });
    assert.equal(hint.lastActivityAt, last.value);
    assert.equal(hint.freshnessMs, 5000);
    assert.equal(hint.reason, "no new transcript lines");
  });
});

describe("exports", () => {
  it("lists RosterSnapshot among the exported types", () => {
    assert.ok(EXPORTED_TYPE_NAMES.includes("RosterSnapshot"));
    assert.equal(EXPORTED_TYPE_NAMES.length, 10);
  });

  it("keeps EXPORTED_TYPE_NAMES aligned with export type", () => {
    const source = readFileSync(sourcePath, "utf8");
    assert.deepEqual([...EXPORTED_TYPE_NAMES].sort(), exportedNamesFromSource(source));
  });

  it("names every export in docs/contracts.md", () => {
    const source = readFileSync(sourcePath, "utf8");
    const docs = readFileSync(docsPath, "utf8");
    const names = [
      ...exportedNamesFromSource(source),
      ...exportedValueNamesFromSource(source),
    ];
    for (const name of names) {
      assert.ok(docs.includes(name), `docs/contracts.md must name ${name}`);
    }
  });

  it("typechecks a bot without seatId", () => {
    const id = parseBotId("a77fae77-0494-4981-acf5-2de5bd793fe4");
    assert.equal(id.ok, true);
    if (!id.ok) {
      return;
    }
    const bot = { id: id.value, name: "Koji" } satisfies BotRecord;
    assert.equal("spatial" in bot, false);
  });
});
