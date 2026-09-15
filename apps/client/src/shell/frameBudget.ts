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

export function startFrameBudget(root: HTMLElement): () => void {
  const avg = rollingAverage(2000);
  let lastWriteAt = Number.NEGATIVE_INFINITY;
  let frameId = 0;
  let stopped = false;

  const tick = (timestamp: number): void => {
    if (stopped) {
      return;
    }
    const now = performance.now();
    // The sample is elapsed time from the frame's start to this callback, so it
    // covers the theme's paint only while this loop is registered after the
    // theme's. Callers restart the instrument after a theme swap to keep that true.
    avg.push(now, Math.max(0, now - timestamp));
    if (now - lastWriteAt >= 1000) {
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
