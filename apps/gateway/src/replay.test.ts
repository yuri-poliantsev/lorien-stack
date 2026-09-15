import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { repoRootFromModule } from "./main.ts";
import {
  cloneBotId,
  expandDemoRoster,
  loadFixtureAgents,
  loadReplayPlan,
} from "./replay.ts";

const ivo = "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9";
const ivo2 = "18647844-28d6-56d4-b74d-a692b5b00178";
const lauren = "af4c6d21-9ef6-4435-8232-bf09ca561583";

describe("demo roster expansion", () => {
  it("clones Ivo with a fixed UUID v5 and name Ivo 2", () => {
    assert.equal(cloneBotId({ sourceId: ivo, wave: 1 }), ivo2);
  });

  it("takes the first fixture by id when N is 1 and clones when N is 9", async () => {
    const fixtures = await loadFixtureAgents(
      path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
    );
    assert.equal(fixtures[0]?.id, ivo);
    assert.equal(fixtures[0]?.name, "Ivo");
    const one = expandDemoRoster({ fixtures, botCount: 1 });
    assert.equal(one.length, 1);
    assert.equal(one[0]?.id, ivo);
    assert.equal(one[0]?.name, "Ivo");
    const nine = expandDemoRoster({ fixtures, botCount: 9 });
    assert.equal(nine.length, 9);
    assert.equal(nine[8]?.id, ivo2);
    assert.equal(nine[8]?.name, "Ivo 2");
    const eight = expandDemoRoster({ fixtures, botCount: 8 });
    assert.equal(eight.length, 8);
    assert.equal(
      eight.some((slot) => slot.id === lauren),
      true,
    );
  });

  it("covers reading, writing, shell, and talking tool names", async () => {
    const fixtures = await loadFixtureAgents(
      path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
    );
    const names = new Set();
    let talking = false;
    for (const fixture of fixtures) {
      for (const line of fixture.transcriptLines) {
        const json = JSON.parse(line);
        if (json.role === "assistant") {
          const blocks = json.message?.content;
          if (Array.isArray(blocks)) {
            talking =
              talking ||
              blocks.some(
                (block) => block.type === "text" && typeof block.text === "string",
              );
            for (const block of blocks) {
              if (block.type === "tool_use" && typeof block.name === "string") {
                names.add(block.name);
              }
            }
          }
        }
        if (json.role === "tool") {
          const blocks = json.message?.content;
          if (Array.isArray(blocks)) {
            for (const block of blocks) {
              if (typeof block.name === "string") {
                names.add(block.name);
              }
            }
          }
        }
      }
    }
    assert.equal(talking, true);
    assert.deepEqual(
      [...names].sort(),
      [
        "Read",
        "StrReplace",
        "Write",
        "edit_file",
        "grep",
        "list_dir",
        "read_file",
        "run_terminal_cmd",
        "shell",
      ],
    );
  });
});

describe("loadReplayPlan", () => {
  const roots: string[] = [];
  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("builds 40 looping tapes and an idle plan with no appends", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-plan-"));
    roots.push(workRoot);
    const fixtureRoot = path.join(repoRootFromModule(import.meta.url), "fixtures/demo");
    const looped = await loadReplayPlan({
      fixtureRoot,
      workRoot,
      multiplier: 1000,
      botCount: 40,
    });
    assert.equal(looped.bots.length, 40);
    assert.equal(looped.tapes.length, 40);
    assert.equal(looped.loop, true);
    assert.equal(looped.bots[0]?.id, ivo);
    assert.equal(looped.bots[8]?.id, ivo2);
    assert.equal(looped.tapes.every((tape) => tape.appends.length > 0), true);
    const idle = await loadReplayPlan({
      fixtureRoot,
      workRoot,
      multiplier: 1000,
      botCount: 8,
      idle: true,
    });
    assert.equal(idle.loop, false);
    assert.equal(idle.tapes.length, 8);
    assert.equal(
      idle.tapes.every((tape) => tape.appends.length === 0),
      true,
    );
  });
});
