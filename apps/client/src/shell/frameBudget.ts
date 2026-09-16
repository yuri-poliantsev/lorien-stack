export type RollingAverage = {
  push(atMs: number, sampleMs: number): void;
  average(): number;
  count(): number;
};

export function rollingAverage(windowMs: number): RollingAverage {
  const samples: { atMs: number; sampleMs: number }[] = [];
  let newestAtMs = Number.NEGATIVE_INFINITY;

  return {
    push(atMs, sampleMs) {
      samples.push({ atMs, sampleMs });
      if (atMs > newestAtMs) {
        newestAtMs = atMs;
      }
      const cutoff = newestAtMs - windowMs;
      let write = 0;
      for (const sample of samples) {
        if (sample.atMs > cutoff) {
          samples[write] = sample;
          write += 1;
        }
      }
      samples.length = write;
    },
    average() {
      if (samples.length === 0) {
        return 0;
      }
      let sum = 0;
      for (const sample of samples) {
        sum += sample.sampleMs;
      }
      return sum / samples.length;
    },
    count() {
      return samples.length;
    },
  };
}

export const FRAME_BUDGET_WINDOW_MS = 2000;
export const FRAME_BUDGET_WRITE_MS = 1000;
export const FRAME_BUDGET_MIN_SAMPLES = 20;

export function startFrameBudget(root: HTMLElement): () => void {
  const avg = rollingAverage(FRAME_BUDGET_WINDOW_MS);
  let lastWriteAt: number | undefined;
  let frameId = 0;
  let stopped = false;

  const tick = (timestamp: number): void => {
    if (stopped) {
      return;
    }
    const now = performance.now();
    if (lastWriteAt === undefined) {
      lastWriteAt = now;
    }
    // The sample is elapsed time from the frame's start to this callback, so it
    // covers the theme's paint only while this loop is registered after the
    // theme's. Callers restart the instrument after a theme swap to keep that true.
    avg.push(now, Math.max(0, now - timestamp));
    // Publishing the first frame would publish page load. A reader wants the
    // steady state, so the value appears once the window holds real frames.
    if (
      now - lastWriteAt >= FRAME_BUDGET_WRITE_MS &&
      avg.count() >= FRAME_BUDGET_MIN_SAMPLES
    ) {
      lastWriteAt = now;
      root.dataset.avgFrameMs = avg.average().toFixed(2);
    }
    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);
  return () => {
    stopped = true;
    window.cancelAnimationFrame(frameId);
  };
}
