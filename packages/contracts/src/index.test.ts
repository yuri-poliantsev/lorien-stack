import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  CONTRACTS_SCHEMA_VERSION,
  EXPORTED_TYPE_NAMES,
  parseActivityJsonl,
  parseAgentProfile,
  parseBotId,
  parseIsoTimestamp,
  parseWakeRequest,
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
      const events: ActivityEvent[] = parseActivityJsonl({ text, botId: botId.value });
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

  it("rejects unknown roles without throwing", () => {
    const text = [
      `{"role":"user","content":"hello","at":"2026-08-20T10:00:00.000Z"}`,
      `{"role":"system","content":"ignore me","at":"2026-08-20T10:00:01.000Z"}`,
      `{"role":"assistant","content":"hi","at":"2026-08-20T10:00:02.000Z"}`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId });
    assert.deepEqual(
      events.map((event) => event.role),
      ["user", "assistant"],
    );
  });

  it("skips a truncated last line and keeps prior events", () => {
    const text = [
      `{"role":"user","content":"keep me","at":"2026-08-20T10:00:00.000Z"}`,
      `{"role":"assistant","content":"also keep","at":"2026-08-20T10:00:01.000Z"}`,
      `{"role":"assistant","content":"cut`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId });
    assert.equal(events.length, 2);
    assert.equal(events[0]?.text, "keep me");
    assert.equal(events[1]?.text, "also keep");
  });

  it("skips a line with no timestamp", () => {
    const text = [
      `{"role":"user","content":"dated","at":"2026-08-20T10:00:00.000Z"}`,
      `{"role":"assistant","content":"undated"}`,
    ].join("\n");
    const events = parseActivityJsonl({ text, botId });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.text, "dated");
  });
});

describe("wake and presence", () => {
  it("fails closed on an empty prompt", () => {
    const botId = "af4c6d21-9ef6-4435-8232-bf09ca561583";
    const empty = parseWakeRequest({ botId, prompt: "" });
    assert.equal(empty.ok, false);
    const blank = parseWakeRequest({ botId, prompt: "   " });
    assert.equal(blank.ok, false);
    const missing = parseWakeRequest({ botId });
    assert.equal(missing.ok, false);
    const ok = parseWakeRequest({ botId, prompt: "wake up" });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.schemaVersion, CONTRACTS_SCHEMA_VERSION);
      assert.equal(ok.value.prompt, "wake up");
    }
  });

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
  it("lists RosterSnapshot and WakeRequest", () => {
    assert.ok(EXPORTED_TYPE_NAMES.includes("RosterSnapshot"));
    assert.ok(EXPORTED_TYPE_NAMES.includes("WakeRequest"));
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
