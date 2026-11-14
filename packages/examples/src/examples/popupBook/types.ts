/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const LAYER_IDS = ["mountains", "clouds", "trees", "character"] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export const LIGHT_PRESET_IDS = ["dawn", "dusk", "moon"] as const;

export type LightPresetId = (typeof LIGHT_PRESET_IDS)[number];

export interface LightPreset {
	label: string;
	english: string;
	color: string;
	glow: string;
	ambient: string;
}

export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
	dawn: {
		label: "Dawn",
		english: "Dawn",
		color: "#ffd277",
		glow: "#ffb84d",
		ambient: "#17232b",
	},
	dusk: {
		label: "Dusk",
		english: "Dusk",
		color: "#ff9966",
		glow: "#ff6b45",
		ambient: "#211827",
	},
	moon: {
		label: "Moonlight",
		english: "Moonlight",
		color: "#b9dcff",
		glow: "#7da9ff",
		ambient: "#0b1425",
	},
};

export interface LayerSettings {
	/** Parallax strength. Lower values sit farther away. */
	depth: number;
	/** Horizontal placement in the authored scene, before pointer parallax. */
	offsetX: number;
	/** CSS-pixel blur applied when the layer is composited. */
	blur: number;
	/** How strongly the layer casts a shadow and catches a rim light. */
	shadow: number;
}

export interface LightSettings {
	x: number;
	y: number;
	intensity: number;
	preset: LightPresetId;
	color: string;
	glow: string;
}

export interface Keyframe {
	time: number;
	lightX: number;
	lightY: number;
	offsets: Record<LayerId, number>;
}

export interface BookProject {
	version: 1;
	title: string;
	duration: number;
	layers: Record<LayerId, LayerSettings>;
	light: LightSettings;
	keyframes: Keyframe[];
}

export interface SampledPose {
	lightX: number;
	lightY: number;
	offsets: Record<LayerId, number>;
}
