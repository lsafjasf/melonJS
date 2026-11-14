/**
 * melonJS — pseudo-colour terrain: channel curves and pixel composition.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

import type { Band, Terrain } from "./terrain";

export const CHANNELS = ["R", "G", "B", "A"] as const;
export type Channel = (typeof CHANNELS)[number];
export type RgbChannel = "R" | "G" | "B";
export type CurvePoints = [number, number, number];
export type CurveMap = Record<RgbChannel, CurvePoints>;

export type EditorState = {
	seed: string;
	assignments: [number, number, number, number];
	curves: CurveMap;
	preset: string;
};

export type Preset = {
	key: string;
	name: string;
	description: string;
	assignments: [number, number, number, number];
	curves: CurveMap;
};

export const PRESETS: Preset[] = [
	{
		key: "mineral",
		name: "Mineral survey",
		description: "Ridges in red, moisture in green, elevation in blue.",
		assignments: [3, 1, 0, 2],
		curves: {
			R: [0.17, 0.52, 0.86],
			G: [0.26, 0.62, 0.92],
			B: [0.13, 0.46, 0.8],
		},
	},
	{
		key: "thermal",
		name: "Thermal field",
		description: "Heat leads in red, with cool ridge lines in green.",
		assignments: [2, 3, 0, 1],
		curves: {
			R: [0.09, 0.47, 0.94],
			G: [0.18, 0.38, 0.7],
			B: [0.08, 0.31, 0.61],
		},
	},
	{
		key: "vegetation",
		name: "Vegetation index",
		description: "Moisture leads, supported by elevation and ridge structure.",
		assignments: [1, 0, 3, 2],
		curves: {
			R: [0.13, 0.38, 0.72],
			G: [0.2, 0.57, 0.9],
			B: [0.12, 0.32, 0.64],
		},
	},
	{
		key: "infrared",
		name: "Infrared",
		description: "Elevation glows, temperature cools, moisture separates.",
		assignments: [0, 2, 1, 3],
		curves: {
			R: [0.08, 0.51, 0.98],
			G: [0.17, 0.41, 0.65],
			B: [0.07, 0.27, 0.58],
		},
	},
];

export const makeEditorState = (preset = PRESETS[0], seed = "424242") => {
	return {
		seed,
		preset: preset.key,
		assignments: [...preset.assignments] as EditorState["assignments"],
		curves: {
			R: [...preset.curves.R] as CurvePoints,
			G: [...preset.curves.G] as CurvePoints,
			B: [...preset.curves.B] as CurvePoints,
		},
	};
};

export const IDENTITY_CURVE: CurvePoints = [0.25, 0.5, 0.75];

/**
 * Build a 256-entry lookup table from three vertical curve handles.
 *
 * The handles sit at x = 0.25, 0.50 and 0.75. Endpoints are pinned at black
 * and white, so every curve describes one monotonic input-to-output mapping.
 * The interpolation is Catmull-Rom; overshoot is clamped because a display
 * level must not wrap around.
 */
export const makeCurveLut = (points: CurvePoints): Uint8ClampedArray => {
	const xs = [0, 0.25, 0.5, 0.75, 1];
	const ys = [0, points[0], points[1], points[2], 1];
	const lut = new Uint8ClampedArray(256);

	const tangent = (index: number) => {
		if (index === 0) {
			return (ys[1] - ys[0]) / (xs[1] - xs[0]);
		}
		if (index === 4) {
			return (ys[4] - ys[3]) / (xs[4] - xs[3]);
		}
		return (ys[index + 1] - ys[index - 1]) / (xs[index + 1] - xs[index - 1]);
	};

	for (let entry = 0; entry < 256; entry++) {
		const x = entry / 255;
		let segment = 0;
		while (segment < 3 && x > xs[segment + 1]) {
			segment++;
		}
		const x0 = xs[segment];
		const x1 = xs[segment + 1];
		const t = (x - x0) / (x1 - x0);
		const t2 = t * t;
		const t3 = t2 * t;
		const h00 = 2 * t3 - 3 * t2 + 1;
		const h10 = t3 - 2 * t2 + t;
		const h01 = -2 * t3 + 3 * t2;
		const h11 = t3 - t2;
		const value =
			h00 * ys[segment] +
			h10 * (x1 - x0) * tangent(segment) +
			h01 * ys[segment + 1] +
			h11 * (x1 - x0) * tangent(segment + 1);
		lut[entry] = Math.round(Math.min(1, Math.max(0, value)) * 255);
	}
	return lut;
};

export const makeCurveLuts = (curves: CurveMap) => {
	return {
		R: makeCurveLut(curves.R),
		G: makeCurveLut(curves.G),
		B: makeCurveLut(curves.B),
		A: new Uint8ClampedArray(256).map((_, index) => index),
	};
};

export type CurveLuts = ReturnType<typeof makeCurveLuts>;

export type ProcessedImage = {
	pixels: Uint8ClampedArray;
	width: number;
	height: number;
};

export const composeImage = (
	terrain: Terrain,
	state: EditorState,
	luts = makeCurveLuts(state.curves),
): ProcessedImage => {
	const count = terrain.size * terrain.size;
	const pixels = new Uint8ClampedArray(count * 4);
	const [rBand, gBand, bBand, aBand] = state.assignments;

	for (let index = 0; index < count; index++) {
		const offset = index * 4;
		pixels[offset] = luts.R[Math.round(terrain.bands[rBand].data[index] * 255)];
		pixels[offset + 1] =
			luts.G[Math.round(terrain.bands[gBand].data[index] * 255)];
		pixels[offset + 2] =
			luts.B[Math.round(terrain.bands[bBand].data[index] * 255)];
		pixels[offset + 3] = Math.round(terrain.bands[aBand].data[index] * 255);
	}

	return { pixels, width: terrain.size, height: terrain.size };
};

export type TerrainSample = {
	x: number;
	y: number;
	raw: number[];
	processed: number[];
	channels: number[];
};

export const sampleTerrain = (
	terrain: Terrain,
	state: EditorState,
	x: number,
	y: number,
	luts = makeCurveLuts(state.curves),
): TerrainSample => {
	const index = y * terrain.size + x;
	const raw = terrain.bands.map((band) => band.data[index]);
	const processed = raw.map((value, bandIndex) => {
		const channelIndex = state.assignments.indexOf(bandIndex);
		if (channelIndex < 3) {
			return luts[CHANNELS[channelIndex]][Math.round(value * 255)] / 255;
		}
		return value;
	});
	const channels = state.assignments.map((bandIndex) => {
		const channelIndex = state.assignments.indexOf(bandIndex);
		if (channelIndex < 3) {
			return luts[CHANNELS[channelIndex]][
				Math.round(terrain.bands[bandIndex].data[index] * 255)
			];
		}
		return Math.round(terrain.bands[bandIndex].data[index] * 255);
	});
	return { x, y, raw, processed, channels };
};

export const histogram = (
	band: Band,
	bins = 128,
): { counts: Uint32Array; peak: number } => {
	const counts = new Uint32Array(bins);
	for (let i = 0; i < band.data.length; i++) {
		const bin = Math.min(bins - 1, Math.floor(band.data[i] * bins));
		counts[bin]++;
	}
	let peak = 1;
	for (const value of counts) {
		peak = Math.max(peak, value);
	}
	return { counts, peak };
};

export const channelColor = (channel: Channel) => {
	if (channel === "R") return "#ff5b58";
	if (channel === "G") return "#57dc7a";
	if (channel === "B") return "#5a9bff";
	return "#f1bd62";
};

export const hexToRgb = (hex: string): [number, number, number] => {
	const value = Number.parseInt(hex.slice(1), 16);
	return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
