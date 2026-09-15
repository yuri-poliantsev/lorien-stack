import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  eventIdForJsonlLine,
  parseBotId,
  parseIsoTimestamp,
  type ActivityEvent,
} from "@lorien-stack/contracts";

import {
  actionFromEvent,
  nametagFromBotName,
  pathFromToolEvent,
} from "./actions.ts";

const botId = parseBotId("af4c6d21-9ef6-4435-8232-bf09ca561583");
const at = parseIsoTimestamp("2026-08-27T09:00:00.000Z");
assert.equal(botId.ok, true);
assert.equal(at.ok, true);
if (!botId.ok || !at.ok) {
  throw new Error("fixture ids");
}

let nextIndex = 0;

function toolEvent(toolName: string, text = ""): ActivityEvent {
  nextIndex += 1;
  return {
    id: eventIdForJsonlLine({ botId: botId.value, index: nextIndex }),
    botId: botId.value,
    at: at.value,
    role: "tool",
    toolName,
    text,
  };
}

function roleEvent(role: "user" | "assistant", text: string): ActivityEvent {
  nextIndex += 1;
  return {
    id: eventIdForJsonlLine({ botId: botId.value, index: nextIndex }),
    botId: botId.value,
    at: at.value,
    role,
    text,
  };
}

describe("actionFromEvent", () => {
  it("maps fixture and common tool names to literal actions", () => {
    assert.equal(actionFromEvent(toolEvent("read_file")), "reading");
    assert.equal(actionFromEvent(toolEvent("Read")), "reading");
    assert.equal(actionFromEvent(toolEvent("grep")), "reading");
    assert.equal(actionFromEvent(toolEvent("Grep")), "reading");
    assert.equal(actionFromEvent(toolEvent("list_dir")), "reading");
    assert.equal(actionFromEvent(toolEvent("Glob")), "reading");
    assert.equal(actionFromEvent(toolEvent("glob_file_search")), "reading");
    assert.equal(actionFromEvent(toolEvent("codebase_search")), "reading");
    assert.equal(actionFromEvent(toolEvent("SemanticSearch")), "reading");
    assert.equal(actionFromEvent(toolEvent("search_codebase")), "reading");
    assert.equal(actionFromEvent(toolEvent("web_search")), "reading");
    assert.equal(actionFromEvent(toolEvent("WebSearch")), "reading");
    assert.equal(actionFromEvent(toolEvent("WebFetch")), "reading");
    assert.equal(actionFromEvent(toolEvent("browser_navigate")), "reading");
    assert.equal(actionFromEvent(toolEvent("browser_snapshot")), "reading");
    assert.equal(actionFromEvent(toolEvent("ReadLints")), "reading");
    assert.equal(actionFromEvent(toolEvent("read_lints")), "reading");
    assert.equal(actionFromEvent(toolEvent("edit_file")), "writing");
    assert.equal(actionFromEvent(toolEvent("write")), "writing");
    assert.equal(actionFromEvent(toolEvent("Write")), "writing");
    assert.equal(actionFromEvent(toolEvent("StrReplace")), "writing");
    assert.equal(actionFromEvent(toolEvent("search_replace")), "writing");
    assert.equal(actionFromEvent(toolEvent("ApplyPatch")), "writing");
    assert.equal(actionFromEvent(toolEvent("apply_patch")), "writing");
    assert.equal(actionFromEvent(toolEvent("EditNotebook")), "writing");
    assert.equal(actionFromEvent(toolEvent("edit_notebook")), "writing");
    assert.equal(actionFromEvent(toolEvent("Delete")), "writing");
    assert.equal(actionFromEvent(toolEvent("delete_file")), "writing");
    assert.equal(actionFromEvent(toolEvent("shell")), "shell");
    assert.equal(actionFromEvent(toolEvent("Shell")), "shell");
    assert.equal(actionFromEvent(toolEvent("run_terminal_cmd")), "shell");
    assert.equal(actionFromEvent(toolEvent("Bash")), "shell");
    assert.equal(actionFromEvent(toolEvent("BashTool")), "shell");
  });

  it("returns unknown for an unmapped tool name", () => {
    assert.equal(actionFromEvent(toolEvent("no_such_tool")), "unknown");
  });

  it("maps assistant to talking and user to thinking", () => {
    assert.equal(actionFromEvent(roleEvent("assistant", "working on it")), "talking");
    assert.equal(actionFromEvent(roleEvent("user", "read the roster")), "thinking");
  });
});

describe("pathFromToolEvent", () => {
  it("extracts a path from JSON tool input", () => {
    assert.equal(
      pathFromToolEvent(toolEvent("read_file", '{"path":"apps/client/src/main.ts"}')),
      "apps/client/src/main.ts",
    );
  });

  it("extracts a path from fixture free text", () => {
    assert.equal(
      pathFromToolEvent(
        toolEvent("read_file", "packages/contracts/src/index.ts not found yet"),
      ),
      "packages/contracts/src/index.ts",
    );
  });

  it("returns undefined when the tool text has no path", () => {
    assert.equal(pathFromToolEvent(toolEvent("grep", "SpatialAnchor")), undefined);
    assert.equal(pathFromToolEvent(roleEvent("assistant", "apps/client/src/main.ts")), undefined);
  });
});

describe("nametagFromBotName", () => {
  it("NFKC-normalises a combining mark", () => {
    assert.equal(nametagFromBotName("Cafe\u0301"), "Caf\u00e9");
    assert.equal(nametagFromBotName("Lauren"), "Lauren");
  });
});
