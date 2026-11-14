/**
 * melonJS — Repair Pod docking example: fixed mission specification.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEWPORT_W = 1180;
export const VIEWPORT_H = 760;

export const POD_WIDTH = 54;
export const POD_HEIGHT = 28;
export const POD_START = { x: 188, y: 184 };
export const POD_START_ANGLE = 0;

/** Pixels per second squared. Every press adds velocity; nothing removes it. */
export const TRANSLATION_ACCEL = 112;
/** Radians per second squared. Counter-thrust is the only way to stop a spin. */
export const ROTATION_ACCEL = 1.8;
export const MAX_ANGULAR_SPEED = 1.4;

export const FUEL_MAX = 100;
/** Percent per second, per translation thruster pair in use. */
export const TRANSLATION_BURN = 0.62;
/** Percent per second while an attitude thruster pair is firing. */
export const ROTATION_BURN = 0.38;

export const BERTH_FRAME = 170;
export const BERTH_ARM = 20;
export const BERTH_MOUTH = 78;
/** The docking clamp sits in the middle of the mouth, on the outer frame edge. */
export const DOCK_TARGET_RADIUS = BERTH_FRAME / 2;
export const CAPTURE_RADIUS = 40;

/** Limits for a clean clamp. Faster or more crooked arrivals count as impacts. */
export const DOCK_MAX_REL_SPEED = 38;
export const DOCK_MAX_ANGLE_ERROR = (16 * Math.PI) / 180;

export const HULL_MAX = 100;
export const SIGNAL_RADIUS = 820;
export const MISSION_TIME_MS = 180_000;
export const WORLD_MARGIN = 220;

export interface BerthSpec {
	readonly x: number;
	readonly y: number;
	/** Direction of the mouth, in radians. */
	readonly angle: number;
	/** Radians per second. Positive is clockwise in canvas coordinates. */
	readonly spin: number;
	readonly label: string;
}

/**
 * No random map: all three ports, their starting angles and their rotation
 * rates are fixed. The angles put each mouth on the natural side of the
 * route from the previous port.
 */
export const BERTHS: readonly BerthSpec[] = [
	{
		x: 700,
		y: 190,
		angle: Math.PI,
		spin: 0.06,
		label: "PORT 01",
	},
	{
		x: 914,
		y: 492,
		angle: -Math.PI / 2,
		spin: -0.09,
		label: "PORT 02",
	},
	{
		x: 356,
		y: 610,
		angle: 0,
		spin: 0.11,
		label: "PORT 03",
	},
];

export const COLORS = {
	space: "#030711",
	ink: "#dff7ff",
	dim: "#7692a8",
	panel: "#091624",
	panelEdge: "#1f4054",
	cyan: "#55e6ff",
	cyanSoft: "#1c7f91",
	green: "#71f4a8",
	amber: "#ffc857",
	orange: "#ff8e4f",
	red: "#ff5f6d",
	hull: "#71f4a8",
	fuel: "#55e6ff",
	failure: "#ff5f6d",
} as const;
