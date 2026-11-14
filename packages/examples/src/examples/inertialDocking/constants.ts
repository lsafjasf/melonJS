/**
 * melonJS — Inertial Docking.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEWPORT_W = 1280;
export const VIEWPORT_H = 720;

/**
 * The seed is part of the mission, not decoration: the berth phases and their
 * different spin rates are derived from it, so every run presents the same
 * approach problem. The starfield uses a second stream from the same seed.
 */
export const FIXED_SEED = 0x5eedb33f;

export const HULL_MAX = 100;
/**
 * Enough for the intended three-hop reference route with corrections, but not
 * enough to hold the main engine down for the whole trip. At full burn the
 * tank lasts a little under 46 seconds; the route's powered phases use far
 * less than that, and every unpowered second is pure coasting.
 */
export const INITIAL_FUEL = 180;
export const MAIN_BURN = 4;
export const RCS_BURN = 2.5;
export const ROTATION_BURN = 1.8;

export const MAIN_ACCEL = 92;
export const REVERSE_ACCEL = 64;
export const LATERAL_ACCEL = 68;
export const BOOST_MULTIPLIER = 1.55;
export const MAX_SPEED = 250;
export const BOOST_MAX_SPEED = 330;
export const ROTATION_ACCEL = 2.35;
export const MAX_ANGULAR_SPEED = 1.55;

export const SHIP_RADIUS = 10;
export const BERTH_RADIUS = 54;
export const BERTH_WALL = 7;
/** Half-width of the rotating opening, in radians. */
export const BERTH_APERTURE = 0.46;

export const DOCK_RADIUS = 15;
export const DOCK_SPEED = 36;
export const DOCK_ANGLE = 0.22;
export const DOCK_ANGULAR_SPEED = 0.28;

export const RECOVERY_RADIUS = 62;
export const RECOVERY_CAPTURE_RADIUS = 48;
export const RECOVERY_SPEED = 42;
export const RECOVERY_ANGLE = 0.32;
export const RECOVERY_ANGULAR_SPEED = 0.4;
export const RECOVERY_HEADING = 0;

export const START = { x: 178, y: 502 };
export const BERTH_LAYOUT = [
	{ id: "01", x: 407, y: 258 },
	{ id: "02", x: 714, y: 458 },
	{ id: "03", x: 993, y: 246 },
] as const;
export const RECOVERY = { x: 1150, y: 514 };

export const TAU = Math.PI * 2;
