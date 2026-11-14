/**
 * Deterministic pseudo-random helpers for the geological section example.
 *
 * Every value the model or the textures use comes from a `mulberry32`
 * stream keyed by the user-supplied seed, so the same seed always produces
 * the same strata, faults, erosion valleys and texture grain — on every
 * browser and every load. `Math.random()` is deliberately never used.
 */

/** Hash an arbitrary seed string into a 32-bit unsigned integer. */
export const hashSeed = (seed: string): number => {
	let hash = 2166136261;
	for (let i = 0; i < seed.length; i++) {
		hash ^= seed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
};

/** mulberry32: a tiny, fast, seedable PRNG returning floats in [0, 1). */
export const mulberry32 = (seedValue: number): (() => number) => {
	let state = seedValue >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

/** Random float in [min, max) from a PRNG stream. */
export const nextBetween = (
	random: () => number,
	min: number,
	max: number,
): number => min + random() * (max - min);

/** Random integer in [min, max] inclusive from a PRNG stream. */
export const nextInt = (
	random: () => number,
	min: number,
	max: number,
): number => Math.floor(nextBetween(random, min, max + 1));

/** Pick one element of an array from a PRNG stream. */
export const pick = <T>(random: () => number, values: readonly T[]): T =>
	values[Math.floor(random() * values.length) % values.length];
