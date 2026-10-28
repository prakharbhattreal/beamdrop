import { expect, test } from 'bun:test';
import { CODE_ALPHABET, generateCode } from '../src/rooms/codeGenerator';

test('generates codes of the requested length from the alphabet only', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateCode(6);
    expect(code).toHaveLength(6);
    for (const ch of code) expect(CODE_ALPHABET.includes(ch)).toBe(true);
  }
});

test('alphabet has exactly 32 characters (required for unbiased sampling)', () => {
  expect(CODE_ALPHABET).toHaveLength(32);
});

test('codes are not constant', () => {
  const seen = new Set(Array.from({ length: 50 }, () => generateCode(6)));
  expect(seen.size).toBeGreaterThan(40);
});
