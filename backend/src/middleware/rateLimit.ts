/**
 * Sliding-window limiter for FAILED attempts (e.g. wrong room codes).
 * Slows brute-forcing of the 6-character code. In-memory → resets on restart
 * and is per-instance; use Redis if you ever run multiple instances.
 */
export class FailureLimiter {
  private hits = new Map<string, number[]>();
  private maxFailures: number;
  private windowMs: number;
  private now: () => number;

  constructor(maxFailures: number, windowMs: number, now: () => number = () => Date.now()) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
  }

  isBlocked(key: string): boolean {
    return this.recent(key).length >= this.maxFailures;
  }

  recordFailure(key: string): void {
    const list = this.recent(key);
    list.push(this.now());
    this.hits.set(key, list);
  }

  /** Drop expired entries so the map doesn't grow forever. */
  cleanup(): void {
    for (const key of [...this.hits.keys()]) {
      const list = this.recent(key);
      if (list.length === 0) this.hits.delete(key);
      else this.hits.set(key, list);
    }
  }

  private recent(key: string): number[] {
    const cutoff = this.now() - this.windowMs;
    return (this.hits.get(key) ?? []).filter((t) => t > cutoff);
  }
}
