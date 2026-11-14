/**
 * Shared types for the procedural binaural listening workbench.
 *
 * Room coordinates are metres: x grows to the right, y grows toward the
 * back of the room (so the front wall is y = 0). A plan position is a
 * 2-D point; the listening height is fixed at the seated-ear height.
 */

/** A point on the room plan, in metres. */
export interface PlanPoint {
	x: number;
	y: number;
}

/** Rectangular room dimensions, in metres. */
export interface RoomDimensions {
	width: number;
	depth: number;
	height: number;
}

/**
 * Acoustic wall materials. Only the frequency-independent Sabine
 * absorption coefficient and a short label are needed to drive the
 * procedural impulse response.
 */
export interface WallMaterial {
	id: string;
	label: string;
	/** average absorption coefficient across the audible band, 0..1 */
	absorption: number;
}

export const WALL_MATERIALS: readonly WallMaterial[] = [
	{ id: "brick", label: "Bare brick / concrete", absorption: 0.04 },
	{ id: "plaster", label: "Plaster on masonry", absorption: 0.08 },
	{ id: "wood", label: "Wood panelling", absorption: 0.15 },
	{ id: "curtain", label: "Heavy curtains", absorption: 0.4 },
	{ id: "foam", label: "Acoustic foam panels", absorption: 0.7 },
] as const;

export const ROOM_PRESETS: ReadonlyArray<{
	id: string;
	label: string;
	dimensions: RoomDimensions;
}> = [
	{
		id: "booth",
		label: "Vocal booth (3 × 3 × 2.4 m)",
		dimensions: { width: 3, depth: 3, height: 2.4 },
	},
	{
		id: "studio",
		label: "Studio room (6 × 5 × 3 m)",
		dimensions: { width: 6, depth: 5, height: 3 },
	},
	{
		id: "hall",
		label: "Small hall (12 × 9 × 4.5 m)",
		dimensions: { width: 12, depth: 9, height: 4.5 },
	},
] as const;

/** Which signal path reaches the output. */
export type OutputMode = "dry" | "wet" | "binaural";

export const OUTPUT_MODES: ReadonlyArray<{ id: OutputMode; label: string }> = [
	{ id: "dry", label: "Dry (direct path only)" },
	{ id: "wet", label: "Wet (reverb convolution only)" },
	{ id: "binaural", label: "Binaural (dry + wet, both spatialised)" },
] as const;

/** Everything the DSP needs to know about one listening moment. */
export interface SpatialState {
	/** listener position on the plan, metres */
	listener: PlanPoint;
	/** moving source position on the plan, metres */
	source: PlanPoint;
	/** direction the listener faces, radians; 0 faces the front wall */
	listenerHeading: number;
}

/** The computed localisation cues for one source/listener pair. */
export interface SpatialCues {
	/**
	 * Azimuth of the source relative to the listener's heading, in the
	 * range -PI..PI. Negative is left, positive is right.
	 */
	azimuth: number;
	/** straight-line source-to-listener distance, metres */
	distance: number;
	/** true when the source is behind the listener's heading */
	behind: boolean;
	/** equal-power stereo pan value, -1 (left) .. 1 (right) */
	pan: number;
	/** distance gain, 0..1 (1 at and inside the reference distance) */
	distanceGain: number;
	/** low-pass cutoff in Hz applied when the source is behind */
	frontBackFilterHz: number;
}
