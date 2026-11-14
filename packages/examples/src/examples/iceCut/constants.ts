/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const ICE = {
	x: 270,
	y: 126,
	w: 740,
	h: 512,
};

export const MASK_SCALE = 2;
export const MASK_W = ICE.w / MASK_SCALE;
export const MASK_H = ICE.h / MASK_SCALE;

export const RUN_TIME = 90;
export const INITIAL_THICKNESS = 100;
export const CUT_THROUGH_THRESHOLD = 2;
export const MIN_BODY_INTEGRITY = 0.32;

export const AMBIENT_TEMP = 24;
export const MIN_TEMP = 10;
export const MAX_TEMP = 100;
export const CUT_MIN_TEMP = 42;
export const IDEAL_TEMP = 62;
export const MELT_TEMP = 82;

export const TEMP_RATE = 52;
export const TEMP_DECAY = 14;
export const MAX_CUTTER_SPEED = 188;
export const CUTTER_ACCEL = 13;
export const CUTTER_STOP_ACCEL = 18;

export const TARGET_HIT_RADIUS = 18;
export const TARGET_COMPLETE_COVERAGE = 0.8;
export const TARGET_COMPLETE_QUALITY = 0.34;

export interface Point {
	x: number;
	y: number;
}

export interface ShapeSpec {
	id: string;
	name: string;
	col: number;
	center: Point;
	points: Point[];
}

const ellipsePoints = (
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	count = 80,
): Point[] => {
	const points: Point[] = [];
	for (let i = 0; i < count; i++) {
		const a = (i / count) * Math.PI * 2;
		points.push({
			x: cx + Math.cos(a) * rx,
			y: cy + Math.sin(a) * ry,
		});
	}
	return points;
};

const starPoints = (
	cx: number,
	cy: number,
	outer: number,
	inner: number,
	spikes = 5,
): Point[] => {
	const points: Point[] = [];
	for (let i = 0; i < spikes * 2; i++) {
		const a = -Math.PI / 2 + (i / (spikes * 2)) * Math.PI * 2;
		const r = i % 2 === 0 ? outer : inner;
		points.push({
			x: cx + Math.cos(a) * r,
			y: cy + Math.sin(a) * r,
		});
	}
	return points;
};

export const SHAPES: ShapeSpec[] = [
	{
		id: "halo",
		name: "HALO",
		col: 0,
		center: { x: 138, y: 268 },
		points: ellipsePoints(138, 268, 80, 62),
	},
	{
		id: "shard",
		name: "SHARD",
		col: 1,
		center: { x: 370, y: 270 },
		points: [
			{ x: 370, y: 166 },
			{ x: 460, y: 338 },
			{ x: 280, y: 338 },
		],
	},
	{
		id: "crest",
		name: "CREST",
		col: 2,
		center: { x: 604, y: 270 },
		points: starPoints(604, 270, 84, 37),
	},
];

export const tempColor = (temperature: number): string => {
	const t = Math.max(0, Math.min(1, temperature / MAX_TEMP));
	if (t < 0.5) {
		const p = t * 2;
		return `rgb(${Math.round(92 + p * 34)}, ${Math.round(221 + p * 34)}, ${Math.round(255 - p * 41)})`;
	}
	if (t < 0.8) {
		const p = (t - 0.5) / 0.3;
		return `rgb(${Math.round(126 + p * 129)}, ${Math.round(255 - p * 49)}, ${Math.round(214 - p * 122)})`;
	}
	const p = (t - 0.8) / 0.2;
	return `rgb(255, ${Math.round(206 - p * 123)}, ${Math.round(92 - p * 38)})`;
};
