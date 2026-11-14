/**
 * melonJS — two-player gantry crane example: layout and feel constants.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const VIEWPORT_W = 1280;
export const VIEWPORT_H = 720;

export const YARD = {
	left: 76,
	right: 1204,
	top: 150,
	bottom: 686,
} as const;

export const BEAM_MIN_X = 118;
export const BEAM_MAX_X = 1162;
export const TROLLEY_MIN_Y = 222;
export const TROLLEY_MAX_Y = 662;

export const CRATE_SIZE = 52;
export const CRATE_RADIUS = 27;
export const HOOK_RADIUS = 13;
export const SLOT_WIDTH = 142;
export const SLOT_HEIGHT = 82;
export const SLOT_Y = 264;
export const SLOT_X = [212, 424, 636, 848, 1060] as const;

export const RUN_SECONDS = 180;
export const MAX_DURABILITY = 100;
export const PIPE_DAMAGE_PER_SECOND = 23;

export const BEAM_SPEED = 286;
export const TROLLEY_SPEED = 248;
export const HOIST_SPEED = 0.72;
export const HOIST_MIN = 0;
export const HOIST_MAX = 1;

export const ATTACH_HEIGHT = 0.105;
export const ATTACH_DISTANCE = 30;
export const ATTACH_SPEED = 46;
export const PLACE_HEIGHT = 0.085;
export const PLACE_DISTANCE = 34;
export const PLACE_SPEED = 29;
export const PIPE_HOOK_RADIUS = 19;

export const HIT_SOUND_INTERVAL = 0.34;

export interface CrateSpec {
	readonly label: string;
	readonly color: string;
	readonly weight: number;
	readonly pickupX: number;
	readonly pickupY: number;
	readonly targetSlot: number;
}

/**
 * Five loads, lightest first. The increasing weight makes the last few
 * lifts noticeably slower to stop and slower to hoist, without adding
 * another control to learn.
 */
export const CRATE_SPECS: readonly CrateSpec[] = [
	{
		label: "01",
		color: "#d9824f",
		weight: 1.0,
		pickupX: 166,
		pickupY: 606,
		targetSlot: 0,
	},
	{
		label: "02",
		color: "#9fbd63",
		weight: 1.14,
		pickupX: 354,
		pickupY: 628,
		targetSlot: 1,
	},
	{
		label: "03",
		color: "#d6a646",
		weight: 1.3,
		pickupX: 528,
		pickupY: 594,
		targetSlot: 2,
	},
	{
		label: "04",
		color: "#67a8c8",
		weight: 1.46,
		pickupX: 768,
		pickupY: 624,
		targetSlot: 3,
	},
	{
		label: "05",
		color: "#b77acb",
		weight: 1.62,
		pickupX: 1018,
		pickupY: 594,
		targetSlot: 4,
	},
];

export interface PipeSpec {
	readonly clearance: number;
	readonly points: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Suspended conduit runs. A load below the stamped clearance height cannot
 * pass over them: the right-hand player raises the hook until the clearance
 * gauge turns green, then both players traverse together.
 */
export const PIPES: readonly PipeSpec[] = [
	{
		clearance: 0.48,
		points: [
			{ x: 102, y: 366 },
			{ x: 535, y: 366 },
			{ x: 535, y: 448 },
			{ x: 712, y: 448 },
		],
	},
	{
		clearance: 0.42,
		points: [
			{ x: 782, y: 448 },
			{ x: 1032, y: 448 },
			{ x: 1032, y: 378 },
			{ x: 1178, y: 378 },
		],
	},
	{
		clearance: 0.53,
		points: [
			{ x: 112, y: 536 },
			{ x: 458, y: 536 },
		],
	},
];

export const COLORS = {
	background: "#071014",
	yard: "#0d181c",
	yardAlt: "#111f23",
	grid: "#193036",
	panel: "#0a1519",
	panelEdge: "#29434a",
	text: "#dbe8ea",
	muted: "#779096",
	beam: "#e0b43a",
	beamShadow: "#705a18",
	leftPlayer: "#49d5e8",
	rightPlayer: "#ff9b52",
	safe: "#75d986",
	danger: "#ff5d55",
	pipe: "#86515b",
	pipeHot: "#ffb15b",
	timer: "#dbe8ea",
} as const;
