import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ActivityEvent, BotId, EventId, IsoTimestamp } from "@lorien-stack/contracts";

import { plotLabel, shortenPath } from "./label.ts";
import { eventSignature, poseFromPulse } from "./pose.ts";

const BOT = "af4c6d21-9ef6-4435-8232-bf09ca561583" as BotId;

function toolEvent(toolName: string, text: string): ActivityEvent {
  return {
    id: "e1" as EventId,
    botId: BOT,
    at: "2026-09-15T22:00:00.000Z" as IsoTimestamp,
    role: "tool",
    toolName,
    text,
  };
}

describe("starcraft plot label", () => {
  it("shows pose, action and path while a bot is working", () => {
    const label = plotLabel({
      name: "Anouk",
      pose: "working",
      events: [toolEvent("read_file", '{"target_file":"apps/gateway/src/presence.ts"}')],
    });
    assert.equal(label.name, "Anouk", "the nametag is the bot name");
    assert.equal(label.status, "WORKING · READING", "read_file reads as WORKING · READING");
    assert.equal(label.path, "…/src/presence.ts", "the tail of the path survives the budget");
  });

  it("names the pose and nothing else when a bot is idle", () => {
    const label = plotLabel({ name: "Ivo", pose: "idle", events: [toolEvent("shell", "ls")] });
    assert.equal(label.status, "idle", "an idle plot carries no action word");
    assert.equal(label.path, "", "an idle plot carries no path");
  });

  it("shows only the name when a bot is asleep", () => {
    const label = plotLabel({ name: "Wren", pose: "sleeping", events: [toolEvent("shell", "ls")] });
    assert.equal(label.name, "Wren", "a sleeping plot still names its bot");
    assert.equal(label.status, "", "a sleeping plot carries no status line");
    assert.equal(label.path, "", "a sleeping plot carries no path");
  });

  it("NFKC-normalises the nametag", () => {
    assert.equal(
      plotLabel({ name: "Ｍｉｒａ", pose: "idle", events: undefined }).name,
      "Mira",
      "fullwidth latin folds to ascii",
    );
  });

  it("falls back to the bare pose when a working bot has no event yet", () => {
    const label = plotLabel({ name: "Koji", pose: "working", events: [] });
    assert.equal(label.status, "WORKING", "no event means no action word");
  });

  it("reports the assistant and user roles as talking and thinking", () => {
    const assistant: ActivityEvent = {
      id: "e2" as EventId,
      botId: BOT,
      at: "2026-09-15T22:00:00.000Z" as IsoTimestamp,
      role: "assistant",
      text: "on it",
    };
    assert.equal(
      plotLabel({ name: "Reed", pose: "working", events: [assistant] }).status,
      "WORKING · TALKING",
      "an assistant turn reads as talking",
    );
  });
});

describe("starcraft path shortening", () => {
  it("leaves a path that already fits", () => {
    assert.equal(shortenPath("src/store.ts", 30), "src/store.ts");
  });

  it("keeps whole trailing segments", () => {
    assert.equal(
      shortenPath("/Users/me/work/lorien/apps/client/src/store.ts", 30),
      "…/apps/client/src/store.ts",
    );
  });

  it("drops a segment that would push the label past the budget", () => {
    assert.equal(shortenPath("alpha/beta/gamma/delta/file.ts", 20), "…/delta/file.ts");
  });

  it("clips a single oversized segment from the left", () => {
    assert.equal(shortenPath("a/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", 12), "…bbbbbbbbbbb");
  });

  it("keeps the filename at the forty-bot budget of sixteen characters", () => {
    assert.equal(
      shortenPath("apps/gateway/src/presence.ts", 16),
      "…/presence.ts",
    );
    const label = plotLabel({
      name: "Anouk",
      pose: "working",
      events: [toolEvent("read_file", '{"target_file":"apps/gateway/src/presence.ts"}')],
      maxChars: 16,
    });
    assert.equal(label.path, "…/presence.ts", "plotLabel uses the crowded budget");
  });

  it("returns an empty string unchanged", () => {
    assert.equal(shortenPath("", 30), "");
  });
});

describe("starcraft pose", () => {
  it("holds a bot working while its pulse is fresh, then idle, then sleeping", () => {
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 400 }), "working");
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 13_000 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 3, msSincePulse: 30_000 }), "sleeping");
  });

  it("keeps a bot that has never spoken idle before sleeping", () => {
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 100 }), "idle");
    assert.equal(poseFromPulse({ eventCount: 0, msSincePulse: 30_000 }), "sleeping");
  });

  it("changes the signature when the event list grows", () => {
    assert.equal(eventSignature(undefined), "0");
    assert.equal(eventSignature([]), "0");
    assert.equal(eventSignature([toolEvent("shell", "ls")]), "1:e1");
  });
});
