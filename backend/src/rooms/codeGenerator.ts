// No I, O, 0, 1 → fewer typing mistakes. Exactly 32 characters.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Cryptographically secure room code.
 * 256 % 32 === 0, so `byte % 32` is perfectly uniform (no modulo bias).
 * Keep the alphabet length a power of two if you change it.
 */
export function generateCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}
