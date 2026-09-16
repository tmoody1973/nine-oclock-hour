// A tiny bounded worker pool. No `p-limit` or similar dependency for what a dozen lines
// does — see app/api/cron/build-day/route.ts for why concurrency is needed at all (one read
// takes ~25s; a real wire runs ~26 of them, and sequential blows past even a 300s budget).
//
// `run` is expected to catch its own errors — the cron's callback does, recording a failure
// into `day.degraded` before returning normally. This pool ALSO catches anything that
// escapes `run` anyway, as a backstop: a rejection here would otherwise kill that worker's
// while-loop, silently stranding every item still left in its queue without ever recording
// why. One caller bug should cost one missing `degraded` entry, never the rest of the run.
export async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const item = items[i++];
      try {
        await run(item);
      } catch {
        /* backstop only — run() should have already handled and recorded its own failure */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
