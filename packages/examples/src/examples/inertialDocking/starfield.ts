/**
 * melonJS — Inertial Docking: seeded parallax starfield.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { FIXED_SEED } from "./constants";
import { mulberry32 } from "./simulation";

export interface Star {
	x: number;
	y: number;
	radius: number;
	layer: number;
	phase: number;
	twinkle: number;
	cross: boolean;
}

export interface StarLayer {
	depth: number;
	drift: number;
	stars: Star[];
}

/**
 * Paint only a few large stars, then progressively more faint ones, so the
 * three parallax planes read as depth rather than as three random dots.
 */
export function createStarfield(seed = FIXED_SEED): StarLayer[] {
	const random = mulberry32(seed ^ 0x9e3779b9);
	const definitions = [
		{ count: 34, depth: 0.018, drift: 1.4, min: 0.45, max: 0.75, cross: 0.2 },
		{ count: 62, depth: 0.052, drift: 3.2, min: 0.7, max: 1.15, cross: 0.08 },
		{ count: 96, depth: 0.115, drift: 6.8, min: 1.0, max: 1.8, cross: 0.02 },
	];

	return definitions.map((definition, layer) => {
		const stars: Star[] = [];
		for (let i = 0; i < definition.count; i++) {
			stars.push({
				x: random(),
				y: random(),
				radius: definition.min + random() * (definition.max - definition.min),
				layer,
				phase: random() * Math.PI * 2,
				twinkle: 0.7 + random() * 2.1,
				cross: random() < definition.cross,
			});
		}
		return {
			depth: definition.depth,
			drift: definition.drift,
			stars,
		};
	});
}
