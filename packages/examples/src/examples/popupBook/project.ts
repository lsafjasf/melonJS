/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	type BookProject,
	type Keyframe,
	LAYER_IDS,
	type LayerId,
	type LayerSettings,
	LIGHT_PRESET_IDS,
	LIGHT_PRESETS,
	type LightPresetId,
	type SampledPose,
} from "./types";

export const SCENE_WIDTH = 1200;
export const SCENE_HEIGHT = 700;
export const PROJECT_DURATION = 10;
export const KEYFRAME_COUNT = 4;

const DEFAULT_TIMES = [
	0,
	PROJECT_DURATION / 3,
	(PROJECT_DURATION * 2) / 3,
	PROJECT_DURATION,
];

const DEFAULT_LAYERS: Record<LayerId, LayerSettings> = {
	mountains: { depth: 0.28, offsetX: -14, blur: 0.6, shadow: 0.32 },
	clouds: { depth: 0.12, offsetX: 18, blur: 0.25, shadow: 0.16 },
	trees: { depth: 0.72, offsetX: 28, blur: 0.8, shadow: 0.56 },
	character: { depth: 1.15, offsetX: 0, blur: 0, shadow: 0.82 },
};

const DEFAULT_OFFSETS: Record<LayerId, number>[] = [
	{ mountains: -14, clouds: 18, trees: 28, character: 0 },
	{ mountains: 20, clouds: -16, trees: -10, character: 22 },
	{ mountains: -8, clouds: -30, trees: 26, character: -18 },
	{ mountains: 24, clouds: 10, trees: -24, character: 12 },
];

const DEFAULT_LIGHT_X = [760, 285, 940, 520];
const DEFAULT_LIGHT_Y = [226, 198, 250, 186];

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const finite = (value: unknown, fallback: number) => {
	const number = typeof value === "number" ? value : Number(value);
	return Number.isFinite(number) ? number : fallback;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const copyOffsets = (offsets: Record<LayerId, number>) => ({
	mountains: offsets.mountains,
	clouds: offsets.clouds,
	trees: offsets.trees,
	character: offsets.character,
});

const createDefaultKeyframes = (): Keyframe[] =>
	DEFAULT_TIMES.map((time, index) => ({
		time,
		lightX: DEFAULT_LIGHT_X[index],
		lightY: DEFAULT_LIGHT_Y[index],
		offsets: copyOffsets(DEFAULT_OFFSETS[index]),
	}));

export const createDefaultProject = (): BookProject => ({
	version: 1,
	title: "Paperlight Theater",
	duration: PROJECT_DURATION,
	layers: {
		mountains: { ...DEFAULT_LAYERS.mountains },
		clouds: { ...DEFAULT_LAYERS.clouds },
		trees: { ...DEFAULT_LAYERS.trees },
		character: { ...DEFAULT_LAYERS.character },
	},
	light: {
		x: DEFAULT_LIGHT_X[0],
		y: DEFAULT_LIGHT_Y[0],
		intensity: 0.92,
		preset: "dawn",
		color: LIGHT_PRESETS.dawn.color,
		glow: LIGHT_PRESETS.dawn.glow,
	},
	keyframes: createDefaultKeyframes(),
});

const normalizeTimes = (rawKeyframes: unknown[], duration: number) => {
	const values = rawKeyframes.map((frame, index) => {
		const fallback = DEFAULT_TIMES[index] ?? (duration * index) / 3;
		return isRecord(frame) ? finite(frame.time, fallback) : fallback;
	});
	values[0] = 0;
	values[values.length - 1] = duration;
	for (let index = 1; index < values.length; index++) {
		values[index] = clamp(values[index], values[index - 1] + 0.01, duration);
	}
	return values;
};

export const parseProject = (value: unknown): BookProject => {
	if (!isRecord(value)) {
		throw new Error("The JSON root must be an object.");
	}

	const rawKeyframes = value.keyframes;
	if (!Array.isArray(rawKeyframes) || rawKeyframes.length !== KEYFRAME_COUNT) {
		throw new Error(
			`A project must contain exactly ${KEYFRAME_COUNT} keyframes.`,
		);
	}

	const duration = clamp(finite(value.duration, PROJECT_DURATION), 2, 60);
	const times = normalizeTimes(rawKeyframes, duration);
	const defaults = createDefaultProject();
	const rawLayers = isRecord(value.layers) ? value.layers : {};
	const layers = {} as Record<LayerId, LayerSettings>;

	for (const id of LAYER_IDS) {
		const raw = isRecord(rawLayers[id]) ? rawLayers[id] : {};
		const fallback = defaults.layers[id];
		layers[id] = {
			depth: clamp(finite(raw.depth, fallback.depth), 0.05, 1.8),
			offsetX: clamp(finite(raw.offsetX, fallback.offsetX), -120, 120),
			blur: clamp(finite(raw.blur, fallback.blur), 0, 12),
			shadow: clamp(finite(raw.shadow, fallback.shadow), 0, 1),
		};
	}

	const rawLight = isRecord(value.light) ? value.light : {};
	const preset = LIGHT_PRESET_IDS.includes(rawLight.preset as LightPresetId)
		? (rawLight.preset as LightPresetId)
		: defaults.light.preset;
	const presetData = LIGHT_PRESETS[preset];
	const light = {
		x: clamp(finite(rawLight.x, defaults.light.x), 140, 1060),
		y: clamp(finite(rawLight.y, defaults.light.y), 170, 520),
		intensity: clamp(
			finite(rawLight.intensity, defaults.light.intensity),
			0.2,
			1.5,
		),
		preset,
		color:
			typeof rawLight.color === "string" ? rawLight.color : presetData.color,
		glow: typeof rawLight.glow === "string" ? rawLight.glow : presetData.glow,
	};

	const keyframes = rawKeyframes.map((rawFrame, index) => {
		const frame = isRecord(rawFrame) ? rawFrame : {};
		const rawOffsets = isRecord(frame.offsets) ? frame.offsets : {};
		const fallbackOffsets = DEFAULT_OFFSETS[index] ?? DEFAULT_OFFSETS[0];
		const offsets = {} as Record<LayerId, number>;
		for (const id of LAYER_IDS) {
			offsets[id] = clamp(
				finite(rawOffsets[id], fallbackOffsets[id]),
				-120,
				120,
			);
		}
		return {
			time: times[index],
			lightX: clamp(finite(frame.lightX, DEFAULT_LIGHT_X[index]), 140, 1060),
			lightY: clamp(finite(frame.lightY, DEFAULT_LIGHT_Y[index]), 170, 520),
			offsets,
		};
	});

	return {
		version: 1,
		title: typeof value.title === "string" ? value.title : defaults.title,
		duration,
		layers,
		light,
		keyframes,
	};
};

export const sampleProject = (
	project: BookProject,
	time: number,
): SampledPose => {
	const clampedTime = clamp(time, 0, project.duration);
	let from = project.keyframes[0];
	let to = project.keyframes[project.keyframes.length - 1];

	for (let index = 0; index < project.keyframes.length - 1; index++) {
		const current = project.keyframes[index];
		const next = project.keyframes[index + 1];
		if (clampedTime >= current.time && clampedTime <= next.time) {
			from = current;
			to = next;
			break;
		}
	}

	const span = Math.max(0.0001, to.time - from.time);
	const linear = clamp((clampedTime - from.time) / span, 0, 1);
	const eased = linear * linear * (3 - 2 * linear);
	const offsets = {} as Record<LayerId, number>;
	for (const id of LAYER_IDS) {
		offsets[id] =
			from.offsets[id] + (to.offsets[id] - from.offsets[id]) * eased;
	}
	return {
		lightX: from.lightX + (to.lightX - from.lightX) * eased,
		lightY: from.lightY + (to.lightY - from.lightY) * eased,
		offsets,
	};
};

export const recordKeyframe = (project: BookProject, index: number) => {
	const frame = project.keyframes[index];
	if (!frame) {
		return;
	}
	frame.lightX = project.light.x;
	frame.lightY = project.light.y;
	for (const id of LAYER_IDS) {
		frame.offsets[id] = project.layers[id].offsetX;
	}
};

export const applyKeyframe = (project: BookProject, index: number) => {
	const frame = project.keyframes[index];
	if (!frame) {
		return;
	}
	project.light.x = frame.lightX;
	project.light.y = frame.lightY;
	for (const id of LAYER_IDS) {
		project.layers[id].offsetX = frame.offsets[id];
	}
};

export const formatSeconds = (seconds: number) => {
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds - minutes * 60;
	return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
};
