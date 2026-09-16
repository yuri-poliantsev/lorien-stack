import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { demoFixtures, type DemoFixture } from "./plan.ts";

export const FIXTURE_ROOT = fileURLToPath(new URL("../../../../fixtures/demo", import.meta.url));

function readGlob(dir: string, file: (name: string) => boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const sub of readdirSync(dir)) {
    for (const name of readdirSync(path.join(dir, sub))) {
      if (file(name)) {
        out[`../../../../fixtures/demo/${path.basename(dir)}/${sub}/${name}`] = readFileSync(
          path.join(dir, sub, name),
          "utf8",
        );
      }
    }
  }
  return out;
}

export function loadDemoFixtures(): DemoFixture[] {
  const profiles = Object.fromEntries(
    Object.entries(readGlob(path.join(FIXTURE_ROOT, "agents"), (n) => n === "profile.json")).map(
      ([key, text]) => [key, JSON.parse(text) as unknown],
    ),
  );
  const transcripts = readGlob(path.join(FIXTURE_ROOT, "agent-transcripts"), (n) =>
    n.endsWith(".jsonl"),
  );
  return demoFixtures({ profiles, transcripts });
}
