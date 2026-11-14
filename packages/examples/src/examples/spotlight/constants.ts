/**
 * melonJS — The Last Spotlight example: timing, layout and beam data.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEW_W = 1200;
export const VIEW_H = 720;

export const CUE_COUNT = 8;
export const MAX_MISSES = 3;
export const MAX_GLARES = 2;

export const PERFORM_MS = 2600;
export const REST_MS = 760;

export const AUDIENCE_Y = 642;
export const LIGHT_SOURCE_X = VIEW_W / 2;
export const LIGHT_SOURCE_Y = 112;

export const ACTOR_FEET_Y = 574;
export const ACTOR_FOCUS_Y = 492;
export const ACTOR_MARKS = [280, 600, 920] as const;
export const CUE_PLAN = [0, 2, 1, 2, 0, 2, 1, 0] as const;

export const WINDOW = {
	x: 948,
	y: 184,
	width: 150,
	height: 164,
} as const;

export const WINDOW_TRIGGER_MS = 760;
export const WINDOW_COOLDOWN_MS = 1250;

export interface BeamSpec {
	readonly label: string;
	readonly core: string;
	readonly rim: string;
	readonly halo: string;
	readonly radiusX: number;
	readonly radiusY: number;
	readonly reflectionRate: number;
}

export const BEAMS: readonly BeamSpec[] = [
	{
		label: "WARM",
		core: "#ffd28a",
		rim: "#ff9f43",
		halo: "rgba(255, 176, 88, 0.23)",
		radiusX: 170,
		radiusY: 100,
		reflectionRate: 1,
	},
	{
		label: "COOL",
		core: "#c9e8ff",
		rim: "#65b7ff",
		halo: "rgba(112, 186, 255, 0.2)",
		radiusX: 156,
		radiusY: 92,
		reflectionRate: 1.2,
	},
	{
		label: "NARROW",
		core: "#fff5d6",
		rim: "#ffffff",
		halo: "rgba(255, 249, 226, 0.2)",
		radiusX: 78,
		radiusY: 56,
		reflectionRate: 1.65,
	},
] as const;

export const ACTORS = [
	{ name: "MIRA", role: "the aerialist" },
	{ name: "ELIO", role: "the monologist" },
	{ name: "SABLE", role: "the dancer" },
] as const;
