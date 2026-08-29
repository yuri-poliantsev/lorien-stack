import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, appendFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import type { ActivityEvent, BotId, BotRecord } from "@bot-space/contracts";

import { COALESCE_MS, createTailer, grokDriver, MAX_INITIAL_CATCHUP_BYTES } from "./tail.ts";

const botId = "af4c6d21-9ef6-4435-8232-bf09ca561583";
const line = (n: number) =>
  `{"role":"user","content":"line-${n}","at":"2026-08-20T10:00:0${n}.000Z"}`;

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-tail-"));
  await mkdir(path.join(grokDriver.agentsDir(root), botId), { recursive: true });
  await mkdir(path.join(grokDriver.transcriptsDir(root), botId), { recursive: true });
  await writeFile(
    path.join(grokDriver.agentsDir(root), botId, "profile.json"),
    JSON.stringify({ id: botId, name: "Lauren" }),
  );
  return root;
}

function jsonlPath(root: string): string {
  return path.join(grokDriver.transcriptsDir(root), botId, "session.jsonl");
}

describe("tail", () => {
  const roots: string[] = [];
  after(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("keeps the grok driver name and 250ms coalesce", () => {
    assert.equal(grokDriver.name, "grok");
    assert.equal(COALESCE_MS, 250);
  });

  it("holds offsets so a second tick does not re-emit", async () => {
    const root = await makeRoot();
    roots.push(root);
    const file = jsonlPath(root);
    await writeFile(file, `${line(0)}\n${line(1)}\n`);
    const events: ActivityEvent[][] = [];
    const tailer = createTailer({
      root,
      handlers: {
        onSpawn: () => undefined,
        onGone: () => undefined,
        onEvents: (batch) => {
          events.push(batch);
        },
      },
    });
    await tailer.tick();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.length, 2);
    const offsetAfterFirst = tailer.cursors().get(file)?.offset;
    await tailer.tick();
    assert.equal(events.length, 1);
    assert.equal(tailer.cursors().get(file)?.offset, offsetAfterFirst);
    await appendFile(file, `${line(2)}\n`);
    await tailer.tick();
    assert.equal(events.length, 2);
    assert.equal(events[1]?.length, 1);
    assert.equal(events[1]?.[0]?.text, "line-2");
  });

  it("buffers a partial last line until the newline arrives", async () => {
    const root = await makeRoot();
    roots.push(root);
    const file = jsonlPath(root);
    await writeFile(file, `{"role":"user","content":"cut`);
    const events: ActivityEvent[][] = [];
    const tailer = createTailer({
      root,
      handlers: {
        onSpawn: () => undefined,
        onGone: () => undefined,
        onEvents: (batch) => {
          events.push(batch);
        },
      },
    });
    await tailer.tick();
    assert.equal(events.length, 0);
    assert.ok((tailer.cursors().get(file)?.pending.length ?? 0) > 0);
    await appendFile(file, `","at":"2026-08-20T10:00:00.000Z"}\n`);
    await tailer.tick();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.[0]?.text, "cut");
    assert.equal(tailer.cursors().get(file)?.pending, "");
  });

  it("coalesces a burst into one onEvents call", async () => {
    const root = await makeRoot();
    roots.push(root);
    const file = jsonlPath(root);
    await writeFile(file, "");
    const events: ActivityEvent[][] = [];
    const tailer = createTailer({
      root,
      handlers: {
        onSpawn: () => undefined,
        onGone: () => undefined,
        onEvents: (batch) => {
          events.push(batch);
        },
      },
    });
    await tailer.tick();
    await appendFile(file, `${line(0)}\n${line(1)}\n${line(2)}\n${line(3)}\n${line(4)}\n`);
    await tailer.tick();
    assert.equal(events.length, 1);
    assert.equal(events[0]?.length, 5);
  });

  it("notifies spawn then gone as profiles appear and vanish", async () => {
    const root = await makeRoot();
    roots.push(root);
    const spawned: BotRecord[] = [];
    const gone: BotId[] = [];
    const tailer = createTailer({
      root,
      handlers: {
        onSpawn: (bot) => {
          spawned.push(bot);
        },
        onGone: (id) => {
          gone.push(id);
        },
        onEvents: () => undefined,
      },
    });
    await tailer.tick();
    assert.equal(spawned.length, 1);
    assert.equal(spawned[0]?.name, "Lauren");
    await rm(path.join(grokDriver.agentsDir(root), botId), { recursive: true, force: true });
    await tailer.tick();
    assert.equal(gone.length, 1);
    assert.equal(gone[0], botId);
  });

  it("skips older bytes on a multi-megabyte transcript instead of loading the whole file", async () => {
    const root = await makeRoot();
    roots.push(root);
    const file = jsonlPath(root);
    const early = `${line(0)}\n`;
    const pad = Buffer.alloc(MAX_INITIAL_CATCHUP_BYTES + 64, "x".charCodeAt(0));
    const late = `${line(9)}\n`;
    await writeFile(file, Buffer.concat([Buffer.from(early, "utf8"), pad, Buffer.from(`\n${late}`, "utf8")]));
    const events: ActivityEvent[][] = [];
    const tailer = createTailer({
      root,
      handlers: {
        onSpawn: () => undefined,
        onGone: () => undefined,
        onEvents: (batch) => {
          events.push(batch);
        },
      },
    });
    await tailer.tick();
    const texts = events.flat().map((event) => event.text);
    assert.equal(texts.includes("line-0"), false);
    assert.equal(texts.includes("line-9"), true);
    const offset = tailer.cursors().get(file)?.offset;
    assert.ok(offset !== undefined && offset > MAX_INITIAL_CATCHUP_BYTES);
  });
});
