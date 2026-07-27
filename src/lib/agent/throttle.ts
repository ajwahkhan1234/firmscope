/**
 * Free-tier rate limiting for Gemini.
 *
 * The Gemini free tier caps requests per minute (roughly 10 for Flash). A full
 * teardown makes 15-20 model calls, and the agent naturally bursts — the three
 * diagnostic tools fire back to back, then the content-strategist subagent
 * reads several pages in a row. Unthrottled, a run reliably died about 60% of
 * the way through with a 429.
 *
 * Two mechanisms, because they solve different problems:
 *
 *   1. A token bucket paces normal traffic so we stay under the ceiling. This
 *      is what stops the burst.
 *   2. Retry with exponential backoff catches the cases the bucket cannot
 *      predict — a shared key, another tab, or a per-day rather than
 *      per-minute limit.
 *
 * The cost is wall-clock: a run takes ~2 minutes instead of ~1. That is the
 * right trade for a demo a reviewer will run once, where finishing reliably
 * matters far more than finishing fast.
 */

export interface ThrottleOptions {
  /** Sustained request rate. Default 8/min, under the ~10/min free ceiling. */
  requestsPerMinute?: number;
  /** How many requests may burst before pacing kicks in. */
  burst?: number;
  /** Retry attempts on a 429 before giving up. */
  maxRetries?: number;
}

export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private lastRefill: number;
  /** Serializes waiters so they cannot all wake and drain the bucket at once. */
  private queue: Promise<void> = Promise.resolve();

  constructor(requestsPerMinute: number, burst: number) {
    this.capacity = Math.max(1, burst);
    this.tokens = this.capacity;
    this.refillPerMs = requestsPerMinute / 60_000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  /** Resolves when a request may proceed. */
  acquire(): Promise<void> {
    const run = this.queue.then(async () => {
      for (;;) {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        const deficit = 1 - this.tokens;
        const waitMs = Math.ceil(deficit / this.refillPerMs);
        await sleep(Math.min(waitMs, 30_000));
      }
    });
    // Keep the chain alive even if a waiter rejects.
    this.queue = run.catch(() => {});
    return run;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRateLimitError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  return /\b429\b|rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

/**
 * Run `fn`, retrying on 429 with exponential backoff and jitter.
 * Non-rate-limit errors propagate immediately — retrying a bad API key or a
 * malformed request just wastes the user's time.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
      const backoff = Math.min(2 ** attempt * 4000, 30_000);
      const jitter = Math.random() * 1000;
      await sleep(backoff + jitter);
      attempt += 1;
    }
  }
}
