import type { StoreMessage } from "../store.ts";
import { demoRoster, demoTape, type DemoFixture } from "./plan.ts";
import { createDemoPlayer, DEMO_TICK_MS } from "./player.ts";

export function startDemoSource(input: {
  bots: number;
  fixtures: DemoFixture[];
  onMessage: (message: StoreMessage) => void;
}): { close: () => void } {
  const slots = demoRoster(input.fixtures, input.bots);
  const player = createDemoPlayer({
    bots: slots.map((slot) => slot.record),
    tapes: slots.map(demoTape),
  });
  const origin = performance.now();
  function tick(): void {
    for (const message of player.advance(performance.now() - origin)) {
      input.onMessage(message);
    }
  }
  tick();
  const timer = window.setInterval(tick, DEMO_TICK_MS);
  return {
    close() {
      window.clearInterval(timer);
    },
  };
}
