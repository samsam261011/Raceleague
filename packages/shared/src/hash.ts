/** FNV-1a 32 bits : rapide, stable et identique sur tous les moteurs JS. */
export function fnv1a(bytes: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function fnv1aString(s: string): number {
  return fnv1a(new TextEncoder().encode(s));
}

export function hex(h: number): string {
  return (h >>> 0).toString(16).padStart(8, '0');
}
