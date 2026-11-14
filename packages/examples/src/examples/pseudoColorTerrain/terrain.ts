/**
 * melonJS — pseudo-colour terrain: deterministic band generation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

export const BAND_DEFINITIONS = [
	{ key: "elevation", name: "Elevation", short: "ELEV" },
	{ key: "moisture", name: "Moisture", short: "MOIST" },
	{ key: "temperature", name: "Temperature", short: "TEMP" },
	{ key: "ridges", name: "Ridges", short: "RIDGE" },
] as const;

export type BandKey = (typeof BAND_DEFINITIONS)[number]["key"];

export type Band = {
	index: number;
	key: BandKey;
	name: string;
	short: string;
	data: Float32Array;
	min: number;
	max: number;
	mean: number;
};

export type Terrain = {
	seedText: string;
	numericSeed: number;
	size: number;
	bands: Band[];
};

const hashSeed = (text: string) => {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	h ^= h >>> 16;
	h = Math.imul(h, 0x7feb352d);
	h ^= h >>> 15;
	h = Math.imul(h, 0x846ca68b);
	h ^= h >>> 16;
	return h >>> 0;
};

const mulberry32 = (seed: number) => {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const makeNoise = (seed: number) => {
	const random = mulberry32(seed);
	const permutation = new Uint8Array(512);
	const source = new Uint8Array(256);
	for (let i = 0; i < 256; i++) {
		source[i] = i;
	}
	for (let i = 255; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		const value = source[i];
		source[i] = source[j];
		source[j] = value;
	}
	for (let i = 0; i < 512; i++) {
		permutation[i] = source[i & 255];
	}

	const lattice = (ix: number, iy: number) => {
		const x = ix & 255;
		const y = iy & 255;
		return permutation[permutation[x] + y] / 127.5 - 1;
	};
	const fade = (t: number) => t * t * (3 - 2 * t);

	const value = (x: number, y: number) => {
		const ix = Math.floor(x);
		const iy = Math.floor(y);
		const fx = fade(x - ix);
		const fy = fade(y - iy);
		const a = lattice(ix, iy);
		const b = lattice(ix + 1, iy);
		const c = lattice(ix, iy + 1);
		const d = lattice(ix + 1, iy + 1);
		const top = a + (b - a) * fx;
		const bottom = c + (d - c) * fx;
		return top + (bottom - top) * fy;
	};

	const fbm = (x: number, y: number, octaves: number, gain = 0.5) => {
		let sum = 0;
		let amplitude = 1;
		let frequency = 1;
		let total = 0;
		for (let octave = 0; octave < octaves; octave++) {
			sum += value(x * frequency, y * frequency) * amplitude;
			total += amplitude;
			amplitude *= gain;
			frequency *= 2.03;
		}
		return sum / total;
	};

	const ridged = (x: number, y: number, octaves: number) => {
		let sum = 0;
		let amplitude = 0.58;
		let frequency = 1;
		for (let octave = 0; octave < octaves; octave++) {
			const n = 1 - Math.abs(value(x * frequency, y * frequency));
			sum += n * n * amplitude;
			frequency *= 2.06;
			amplitude *= 0.5;
		}
		return sum;
	};

	return { value, fbm, ridged };
};

const shapeBand = (data: Float32Array) => {
	const sorted = Float32Array.from(data).sort();
	const low = sorted[Math.floor(sorted.length * 0.008)];
	const high = sorted[Math.floor(sorted.length * 0.992)];
	const span = Math.max(1e-6, high - low);
	let sum = 0;
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < data.length; i++) {
		const normalized = Math.min(1, Math.max(0, (data[i] - low) / span));
		data[i] = normalized;
		sum += normalized;
		min = Math.min(min, normalized);
		max = Math.max(max, normalized);
	}
	return { min, max, mean: sum / data.length };
};

export const generateTerrain = (seedText: string, size = 384): Terrain => {
	const normalizedSeed = seedText.trim() || "0";
	const numericSeed = hashSeed(normalizedSeed);
	const noise = makeNoise(numericSeed);
	const count = size * size;
	const fields = BAND_DEFINITIONS.map(() => new Float32Array(count));

	for (let y = 0; y < size; y++) {
		const v = y / (size - 1);
		for (let x = 0; x < size; x++) {
			const u = x / (size - 1);
			const index = y * size + x;

			const warpX = noise.fbm(u * 2.1 + 11.7, v * 2.1 + 4.3, 3) * 0.52;
			const warpY = noise.fbm(u * 2.1 + 31.2, v * 2.1 + 17.6, 3) * 0.52;
			const broad = noise.fbm(u * 2.35 + warpX, v * 2.35 + warpY, 6);
			const ridge = noise.ridged(
				u * 3.2 + warpY * 0.45 + 8.4,
				v * 3.2 - warpX * 0.45 + 19.2,
				5,
			);
			const elevation = 0.5 + broad * 0.5;
			fields[0][index] = Math.min(
				1,
				Math.max(0, elevation * 0.74 + ridge * 0.26),
			);

			const moistureNoise = noise.fbm(
				u * 3.1 + 61.3 + warpX * 0.35,
				v * 3.1 + 22.8 + warpY * 0.35,
				5,
			);
			const fineMoisture = noise.fbm(u * 8.4 + 5.1, v * 8.4 + 41.8, 3);
			fields[1][index] = Math.min(
				1,
				Math.max(
					0,
					0.5 + moistureNoise * 0.36 + fineMoisture * 0.08 - elevation * 0.16,
				),
			);

			const thermalNoise = noise.fbm(
				u * 2.7 + 7.6 - warpY * 0.28,
				v * 2.7 + 71.9 + warpX * 0.28,
				5,
			);
			fields[2][index] = Math.min(
				1,
				Math.max(
					0,
					0.44 + (1 - v) * 0.34 + thermalNoise * 0.28 - elevation * 0.2,
				),
			);

			const ridgeFine = noise.ridged(
				u * 7.2 + 17.5 + warpY * 0.22,
				v * 7.2 + 3.9 - warpX * 0.22,
				4,
			);
			fields[3][index] = Math.min(
				1,
				Math.max(0, ridge * 0.87 + ridgeFine * 0.13),
			);
		}
	}

	const bands: Band[] = BAND_DEFINITIONS.map((definition, index) => {
		const data = fields[index];
		const stats = shapeBand(data);
		return { ...definition, index, data, ...stats };
	});

	return { seedText: normalizedSeed, numericSeed, size, bands };
};
