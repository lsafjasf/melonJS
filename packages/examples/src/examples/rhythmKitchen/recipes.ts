/**
 * melonJS — Rhythm Kitchen example: recipes and timing data.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const DESIGN_WIDTH = 1200;
export const DESIGN_HEIGHT = 720;
export const BPM = 100;
export const BEAT_MS = 60_000 / BPM;
export const RUN_TIME_MS = 20_000;

// Windows are deliberately generous for a first run: a human hears the cue,
// then moves. The perfect window still rewards locking onto the beat.
export const PERFECT_WINDOW_MS = 90;
export const GOOD_WINDOW_MS = 180;
export const OK_WINDOW_MS = 320;

export const HOT_THRESHOLD = 0.78;
export const HOT_BURN_MS = 2_400;
export const LIFT_MIN_MS = 650;

export type StationKind = "soup" | "pan" | "kettle";
export type StationPhase = "idle" | "cooking" | "lifted" | "served" | "burnt";

export type GamePhase = "ready" | "playing" | "won" | "lost";

export interface Recipe {
	readonly kind: StationKind;
	readonly tool: string;
	readonly dish: string;
	readonly ingredient: string;
	readonly key: string;
	readonly addBeat: number;
	readonly takeBeat: number;
	readonly accent: string;
	readonly audioPan: number;
}

export interface StationState {
	readonly kind: StationKind;
	phase: StationPhase;
	addedAt: number | null;
	liftedAt: number | null;
	heat: number;
	hotSince: number | null;
	addQuality: number;
	quality: number;
	note: string;
}

export const RECIPES: readonly Recipe[] = [
	{
		kind: "soup",
		tool: "Soup Pot",
		dish: "Mushroom Soup",
		ingredient: "Mushroom",
		key: "A",
		addBeat: 4,
		takeBeat: 10,
		accent: "#66d9c8",
		audioPan: -0.55,
	},
	{
		kind: "pan",
		tool: "Frying Pan",
		dish: "Pan-Seared Tofu",
		ingredient: "Tofu",
		key: "S",
		addBeat: 8,
		takeBeat: 14,
		accent: "#ffb84d",
		audioPan: 0,
	},
	{
		kind: "kettle",
		tool: "Kettle",
		dish: "Osmanthus Tea",
		ingredient: "Osmanthus",
		key: "D",
		addBeat: 12,
		takeBeat: 18,
		accent: "#d9a7ff",
		audioPan: 0.55,
	},
] as const;

export const CARD_X = [20, 420, 820] as const;
export const CARD_Y = 194;
export const CARD_W = 360;
export const CARD_H = 376;

export function recipeFor(kind: StationKind): Recipe {
	const found = RECIPES.find((recipe) => recipe.kind === kind);
	if (found === undefined) {
		throw new Error(`Unknown station ${kind}`);
	}
	return found;
}

export function createStations(): StationState[] {
	return RECIPES.map((recipe) => ({
		kind: recipe.kind,
		phase: "idle",
		addedAt: null,
		liftedAt: null,
		heat: 0.16,
		hotSince: null,
		addQuality: 0,
		quality: 0,
		note: `Add on beat ${recipe.addBeat + 1}`,
	}));
}

/** A 0..100 timing score, from the distance to the recommended beat. */
export function timingQuality(deltaMs: number): number {
	const distance = Math.abs(deltaMs);
	if (distance <= PERFECT_WINDOW_MS) {
		return 100;
	}
	if (distance <= GOOD_WINDOW_MS) {
		return 88;
	}
	if (distance <= OK_WINDOW_MS) {
		return 68;
	}
	const falloff = Math.max(0, 1 - (distance - OK_WINDOW_MS) / 700);
	return Math.round(18 + falloff * 32);
}

export function formatSeconds(ms: number): string {
	const clamped = Math.max(0, Math.ceil(ms / 1000));
	return `00:${clamped.toString().padStart(2, "0")}`;
}
