import { demoFixtures, type DemoFixture } from "./plan.ts";

const profiles = import.meta.glob("../../../../fixtures/demo/agents/*/profile.json", {
  eager: true,
  import: "default",
});

const transcripts = import.meta.glob(
  "../../../../fixtures/demo/agent-transcripts/*/*.jsonl",
  { eager: true, import: "default", query: "?raw" },
) as Record<string, string>;

export const DEMO_FIXTURES: DemoFixture[] = demoFixtures({ profiles, transcripts });
