import { expect, test } from 'bun:test';
import { FailureLimiter } from '../src/middleware/rateLimit';

test('blocks after max failures and unblocks after the window', () => {
  let t = 0;
  const limiter = new FailureLimiter(3, 1000, () => t);

  limiter.recordFailure('ip');
  limiter.recordFailure('ip');
  expect(limiter.isBlocked('ip')).toBe(false);
  limiter.recordFailure('ip');
  expect(limiter.isBlocked('ip')).toBe(true);
  expect(limiter.isBlocked('other')).toBe(false);

  t = 1001;
  expect(limiter.isBlocked('ip')).toBe(false);
  limiter.cleanup();
});
