/**
 * The standard mulberry32 PRNG: a 32-bit state advanced by a fixed increment and mixed with two
 * multiplies and two shifts. Fast, seedable and good enough for scattering toy datasets and
 * initialising weights — every scene that uses it wants reproducibility, not cryptographic quality.
 *
 * Returns a generator of uniform values in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard normal sample by the Box–Muller transform; the second value of the pair is dropped. */
export function gaussian(rand: () => number): number {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
