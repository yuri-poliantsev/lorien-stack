import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBotId } from "@lorien-stack/contracts";

import {
  expandDemoRoster,
  loadFixtureAgents,
} from "../../../gateway/src/replay.ts";
import { FIXTURE_ROOT, loadDemoFixtures } from "./fixturesFromDisk.ts";
import {
  demoRoster,
  demoTape,
  parseDemoBots,
  resolveDemoSource,
} from "./plan.ts";

describe("resolveDemoSource", () => {
  it("connects live when the URL has no demo param and the build is not hosted", () => {
    assert.deepEqual(resolveDemoSource({ search: "?theme=starcraft", hostedDemo: false }), {
      kind: "live",
    });
  });
  it("defaults to 8 demo bots on a hosted build", () => {
    assert.deepEqual(resolveDemoSource({ search: "", hostedDemo: true }), {
      kind: "demo",
      bots: 8,
    });
  });
  it("reads ?demo=<n>", () => {
    assert.deepEqual(resolveDemoSource({ search: "?demo=40&theme=starcraft", hostedDemo: false }), {
      kind: "demo",
      bots: 40,
    });
  });
  it("treats a bare ?demo as 8", () => {
    assert.deepEqual(resolveDemoSource({ search: "?demo", hostedDemo: false }), {
      kind: "demo",
      bots: 8,
    });
  });
});

describe("parseDemoBots", () => {
  it("clamps to 1..40 and falls back to 8 for junk", () => {
    assert.equal(parseDemoBots("0"), 1);
    assert.equal(parseDemoBots("100"), 40);
    assert.equal(parseDemoBots("18"), 18);
    assert.equal(parseDemoBots("1.5"), 8);
    assert.equal(parseDemoBots("many"), 8);
  });
});

describe("demoFixtures", () => {
  it("bundles the eight fixture agents sorted by id with their transcript lines", () => {
    const fixtures = loadDemoFixtures();
    assert.deepEqual(
      fixtures.map((f) => [f.record.name, f.lines.length]),
      [
        ["Ivo", 7],
        ["Wren", 7],
        ["Sable", 5],
        ["Reed", 5],
        ["Anouk", 7],
        ["Koji", 7],
        ["Mira", 7],
        ["Lauren", 7],
      ],
    );
    assert.equal(fixtures[0]?.record.id, "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9");
  });
});

describe("demoRoster", () => {
  const fixtures = loadDemoFixtures();

  it("takes the first N fixtures by id below the fixture count", () => {
    const slots = demoRoster(fixtures, 3);
    assert.deepEqual(
      slots.map((s) => [s.record.name, s.startOffsetMs]),
      [
        ["Ivo", 0],
        ["Wren", 3500],
        ["Sable", 7000],
      ],
    );
  });

  it("clones with wave-numbered names and distinct valid ids above the fixture count", () => {
    const slots = demoRoster(fixtures, 18);
    assert.deepEqual(slots[8]?.record.name, "Ivo 2");
    assert.deepEqual(slots[16]?.record.name, "Ivo 3");
    assert.equal(slots[8]?.startOffsetMs, 1600);
    assert.equal(slots[17]?.startOffsetMs, 3500 + 3200);
    assert.equal(slots[8]?.record.id, "15aafeb5-603a-4d4b-b25d-8bc5a5280001");
    assert.deepEqual(slots[8]?.lines, fixtures[0]?.lines);
    const ids = new Set(demoRoster(fixtures, 40).map((s) => s.record.id));
    assert.equal(ids.size, 40);
    for (const id of ids) {
      assert.equal(parseBotId(id).ok, true, id);
    }
  });

  it("matches the gateway's expandDemoRoster on names and start offsets, not ids", async () => {
    const gatewayFixtures = await loadFixtureAgents(FIXTURE_ROOT);
    for (const botCount of [1, 8, 18, 40]) {
      const gateway = expandDemoRoster({ fixtures: gatewayFixtures, botCount }).map((s) => [
        s.name,
        s.startOffsetMs,
      ]);
      const client = demoRoster(fixtures, botCount).map((s) => [s.record.name, s.startOffsetMs]);
      assert.deepEqual(
        client,
        gateway,
        `client demo roster names and start offsets at ${String(botCount)} bots must match apps/gateway/src/replay.ts expandDemoRoster; ids are not compared, plan.test.ts asserts them separately`,
      );
    }
  });
});

describe("demoTape", () => {
  it("spaces Ivo's seven lines 800ms apart and holds quiet then sleep", () => {
    const [ivo] = demoRoster(loadDemoFixtures(), 1);
    assert.ok(ivo);
    const tape = demoTape(ivo);
    assert.equal(tape.botId, ivo.record.id);
    assert.equal(tape.startOffsetMs, 0);
    assert.deepEqual(
      tape.cues.map((cue) => [cue.kind, cue.atMs]),
      [
        ["wake", 0],
        ["line", 0],
        ["line", 800],
        ["line", 1600],
        ["line", 2400],
        ["line", 3200],
        ["line", 4000],
        ["line", 4800],
        ["quiet", 4800],
        ["sleep", 8800],
      ],
    );
    assert.equal(tape.periodMs, 11800);
  });

  it("sleeps at once and repeats every hold when a slot has no lines", () => {
    const tape = demoTape({
      record: { id: "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9" as never, name: "Empty" },
      lines: ["not json", "{\"role\":\"user\"}"],
      startOffsetMs: 500,
    });
    assert.deepEqual(tape.cues, [{ atMs: 0, kind: "sleep" }]);
    assert.equal(tape.periodMs, 3000);
  });
});
