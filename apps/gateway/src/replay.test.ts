import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import { parseIsoTimestamp } from "@lorien-stack/contracts";

import { repoRootFromModule } from "./main.ts";
import {
  DEMO_QUIET_HOLD_MS,
  DEMO_SLEEP_HOLD_MS,
  cloneBotId,
  expandDemoRoster,
  loadFixtureAgents,
  loadReplayPlan,
  runReplay,
} from "./replay.ts";

const ivo = "15aafeb5-603a-4d4b-b25d-8bc5a5287fb9";
const ivo2 = "18647844-28d6-56d4-b74d-a692b5b00178";
const wren = "2b40667e-d345-4db1-bbf0-9b26b7f904e9";
const sable = "7820582a-8fe5-4ef5-8ba5-30bf7641f8cc";
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

function createVirtualClock(input: { inflight: number; signal: AbortSignal }) {
  let now = 0;
  let waiters: Array<{ target: number; resolve: () => void }> = [];

  function releaseAll() {
    const pending = waiters;
    waiters = [];
    for (const waiter of pending) {
      waiter.resolve();
    }
  }

  function advance() {
    if (input.signal.aborted) {
      releaseAll();
      return;
    }
    if (waiters.length === 0 || waiters.length < input.inflight) {
      return;
    }
    let min = waiters[0]?.target;
    if (min === undefined) {
      return;
    }
    for (const waiter of waiters) {
      if (waiter.target < min) {
        min = waiter.target;
      }
    }
    now = min;
    const due = waiters.filter((waiter) => waiter.target === min);
    waiters = waiters.filter((waiter) => waiter.target !== min);
    for (const waiter of due) {
      waiter.resolve();
    }
  }

  input.signal.addEventListener("abort", () => {
    releaseAll();
  });

  return {
    now() {
      return now;
    },
    async sleep(ms: number) {
      if (input.signal.aborted) {
        return;
      }
      await new Promise<void>((resolve) => {
        waiters.push({ target: now + ms, resolve });
        if (input.signal.aborted) {
          releaseAll();
          return;
        }
        queueMicrotask(advance);
      });
    },
  };
}

describe("runReplay", () => {
  const roots: string[] = [];
  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("emits the first line of the first three tapes at 0, 3500, and 7000", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-stagger-"));
    roots.push(workRoot);
    const plan = await loadReplayPlan({
      fixtureRoot: path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
      workRoot,
      multiplier: 1000,
      botCount: 3,
    });
    const abort = new AbortController();
    const clock = createVirtualClock({ inflight: 3, signal: abort.signal });
    const firstNow = new Map<string, number>();
    await runReplay({
      plan,
      signal: abort.signal,
      sleep: (ms) => clock.sleep(ms),
      onSleep: () => undefined,
      onAppend(step) {
        if (!firstNow.has(step.botId)) {
          firstNow.set(step.botId, clock.now());
        }
        if (firstNow.size === 3) {
          abort.abort();
        }
      },
    });
    assert.deepEqual(
      [firstNow.get(ivo), firstNow.get(wren), firstNow.get(sable)],
      [0, 3500, 7000],
    );
  });

  it("writes the first tape line again after one loop", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-loop-"));
    roots.push(workRoot);
    const plan = await loadReplayPlan({
      fixtureRoot: path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
      workRoot,
      multiplier: 1000,
      botCount: 1,
    });
    const tape = plan.tapes[0];
    assert.ok(tape !== undefined);
    const first = tape.appends[0];
    assert.ok(first !== undefined);
    const abort = new AbortController();
    const clock = createVirtualClock({ inflight: 1, signal: abort.signal });
    const emits: Array<{ now: number; line: string }> = [];
    const cycleWait = tape.appends.reduce((sum, step) => sum + step.waitMs, 0);
    await runReplay({
      plan,
      signal: abort.signal,
      sleep: (ms) => clock.sleep(ms),
      onSleep: () => undefined,
      onAppend(step) {
        emits.push({ now: clock.now(), line: step.line });
        if (emits.length === tape.appends.length + 1) {
          abort.abort();
        }
      },
    });
    assert.equal(emits[0]?.line, first.line);
    assert.equal(emits[tape.appends.length]?.line, first.line);
    assert.equal(
      emits[tape.appends.length]?.now,
      cycleWait + DEMO_QUIET_HOLD_MS + DEMO_SLEEP_HOLD_MS,
    );
  });

  it("puts the last rewritten event at on the sleep hint, not the fixture date", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-sleep-at-"));
    roots.push(workRoot);
    const plan = await loadReplayPlan({
      fixtureRoot: path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
      workRoot,
      multiplier: 1000,
      botCount: 1,
    });
    const tape = plan.tapes[0];
    assert.ok(tape !== undefined);
    assert.equal(tape.lastActivityAt, "2026-08-27T09:30:03.000Z");
    const issued: string[] = [];
    const abort = new AbortController();
    const clock = createVirtualClock({ inflight: 1, signal: abort.signal });
    let lastWriteAt = "";
    let sleepAt = "";
    await runReplay({
      plan,
      signal: abort.signal,
      sleep: (ms) => clock.sleep(ms),
      now() {
        const raw = `2026-09-16T10:00:${String(issued.length).padStart(2, "0")}.000Z`;
        issued.push(raw);
        const parsed = parseIsoTimestamp(raw);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        return parsed.value;
      },
      onAppend() {
        lastWriteAt = issued[issued.length - 1] ?? "";
      },
      onSleep(step) {
        sleepAt = step.lastActivityAt;
        abort.abort();
      },
    });
    assert.equal(tape.appends.length, 7);
    assert.equal(lastWriteAt, "2026-09-16T10:00:06.000Z");
    assert.equal(sleepAt, "2026-09-16T10:00:06.000Z");
    assert.equal(sleepAt.startsWith("2026-08-27"), false);
  });

  it("emits a recent wake hint when the tape loops", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-wake-"));
    roots.push(workRoot);
    const plan = await loadReplayPlan({
      fixtureRoot: path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
      workRoot,
      multiplier: 1000,
      botCount: 1,
    });
    const abort = new AbortController();
    const clock = createVirtualClock({ inflight: 1, signal: abort.signal });
    const hints: Array<{ kind: string; at: string; now: number }> = [];
    let loops = 0;
    await runReplay({
      plan,
      signal: abort.signal,
      sleep: (ms) => clock.sleep(ms),
      now() {
        const parsed = parseIsoTimestamp("2026-09-16T11:00:00.000Z");
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        return parsed.value;
      },
      onWake(step) {
        hints.push({ kind: step.kind, at: step.lastActivityAt, now: clock.now() });
        loops += 1;
        if (loops === 2) {
          abort.abort();
        }
      },
      onSleep(step) {
        hints.push({ kind: step.kind, at: step.lastActivityAt, now: clock.now() });
      },
    });
    assert.equal(hints[0]?.kind, "wake");
    assert.equal(hints[0]?.at, "2026-09-16T11:00:00.000Z");
    assert.equal(hints[0]?.now, 0);
    const firstSleep = hints.find((item) => item.kind === "sleep");
    assert.equal(firstSleep?.kind, "sleep");
    const secondWake = hints.filter((item) => item.kind === "wake")[1];
    assert.equal(secondWake?.kind, "wake");
    assert.equal(secondWake?.at, "2026-09-16T11:00:00.000Z");
    assert.ok((secondWake?.now ?? 0) > (firstSleep?.now ?? 0));
  });

  it("idles every bot asleep and writes no transcript lines", async () => {
    const workRoot = await mkdtemp(path.join(os.tmpdir(), "demo-idle-"));
    roots.push(workRoot);
    const plan = await loadReplayPlan({
      fixtureRoot: path.join(repoRootFromModule(import.meta.url), "fixtures/demo"),
      workRoot,
      multiplier: 1000,
      botCount: 8,
      idle: true,
    });
    const sleeps: string[] = [];
    const emits: string[] = [];
    await runReplay({
      plan,
      signal: new AbortController().signal,
      sleep: async () => {
        throw new Error("idle replay must not wait");
      },
      onSleep(step) {
        sleeps.push(step.botId);
      },
      onAppend(step) {
        emits.push(step.line);
      },
    });
    assert.deepEqual(emits, []);
    assert.deepEqual(
      sleeps.sort(),
      plan.bots.map((bot) => bot.id).sort(),
    );
    assert.equal(sleeps.length, 8);
  });
});
