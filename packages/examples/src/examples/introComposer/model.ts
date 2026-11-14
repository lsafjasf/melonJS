/**
 * melonJS — procedural intro composer: project model, keyframes and JSON.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const DURATION = 12;
export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export type LayerId = "ripple" | "title" | "light";
export type TrackId = "position" | "scale" | "opacity" | "color";

export type Rgba = [number, number, number, number];
export type Vec2 = { x: number; y: number };

export interface Keyframe<T> {
	id: string;
	time: number;
	value: T;
}

export interface Tracks {
	position: Keyframe<Vec2>[];
	scale: Keyframe<number>[];
	opacity: Keyframe<number>[];
	color: Keyframe<string>[];
}

export interface Layer {
	id: LayerId;
	name: string;
	kind: string;
	visible: boolean;
	tracks: Tracks;
}

export interface Project {
	format: "melonjs-procedural-intro";
	version: 1;
	title: string;
	subtitle: string;
	duration: number;
	fps: number;
	layers: Layer[];
}

export interface LayerSample {
	position: Vec2;
	scale: number;
	opacity: number;
	color: string;
}

let sequence = 0;

export const keyId = (): string => {
	sequence += 1;
	return `k${Date.now().toString(36)}${sequence.toString(36)}`;
};

export const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

export const snapTime = (time: number): number =>
	Math.round(clamp(time, 0, DURATION) * FPS) / FPS;

export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

export const hexToRgba = (hex: string): Rgba => {
	const clean = hex.replace("#", "");
	const full =
		clean.length === 3
			? clean
					.split("")
					.map((part) => part + part)
					.join("")
			: clean.padEnd(6, "0").slice(0, 6);
	const n = Number.parseInt(full, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
};

export const rgbaToHex = (rgba: Rgba): string => {
	const part = (n: number) =>
		Math.round(clamp(n, 0, 255))
			.toString(16)
			.padStart(2, "0");
	return `#${part(rgba[0])}${part(rgba[1])}${part(rgba[2])}`;
};

export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export const mixColor = (a: string, b: string, t: number): string => {
	const ca = hexToRgba(a);
	const cb = hexToRgba(b);
	return rgbaToHex([
		mix(ca[0], cb[0], t),
		mix(ca[1], cb[1], t),
		mix(ca[2], cb[2], t),
		1,
	]);
};

const sorted = <T>(keys: Keyframe<T>[]): Keyframe<T>[] =>
	[...keys].sort((a, b) => a.time - b.time);

/** The track's value at `time`; smooth interpolation between keys. */
export const sampleTrack = <T>(
	keys: Keyframe<T>[],
	time: number,
	fallback: T,
	blend: (a: T, b: T, t: number) => T,
): T => {
	if (keys.length === 0) {
		return fallback;
	}
	const list = sorted(keys);
	if (time <= list[0].time) {
		return list[0].value;
	}
	const last = list[list.length - 1];
	if (time >= last.time) {
		return last.value;
	}
	for (let i = 0; i < list.length - 1; i++) {
		const a = list[i];
		const b = list[i + 1];
		if (time >= a.time && time <= b.time) {
			const span = b.time - a.time;
			const t = span <= 0 ? 1 : smoothstep((time - a.time) / span);
			return blend(a.value, b.value, t);
		}
	}
	return last.value;
};

export const sampleLayer = (layer: Layer, time: number): LayerSample => {
	const position = sampleTrack<Vec2>(
		layer.tracks.position,
		time,
		{ x: 0, y: 0 },
		(a, b, t) => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) }),
	);
	return {
		position,
		scale: sampleTrack(layer.tracks.scale, time, 1, (a, b, t) => mix(a, b, t)),
		opacity: sampleTrack(layer.tracks.opacity, time, 1, (a, b, t) =>
			mix(a, b, t),
		),
		color: sampleTrack(layer.tracks.color, time, "#d9fff4", (a, b, t) =>
			mixColor(a, b, t),
		),
	};
};

export const keyAt = <T>(
	keys: Keyframe<T>[],
	time: number,
	tolerance = 1 / FPS / 2,
): Keyframe<T> | undefined =>
	keys.find((key) => Math.abs(key.time - time) <= tolerance);

export const sortTracks = (layer: Layer): Layer => ({
	...layer,
	tracks: {
		position: sorted(layer.tracks.position),
		scale: sorted(layer.tracks.scale),
		opacity: sorted(layer.tracks.opacity),
		color: sorted(layer.tracks.color),
	},
});

export const trackKeys = (layer: Layer, track: TrackId) => layer.tracks[track];

export const keyCount = (layer: Layer): number =>
	trackKeys(layer, "position").length +
	trackKeys(layer, "scale").length +
	trackKeys(layer, "opacity").length +
	trackKeys(layer, "color").length;

const k = <T>(time: number, value: T): Keyframe<T> => ({
	id: keyId(),
	time,
	value,
});

export const createDefaultProject = (): Project => ({
	format: "melonjs-procedural-intro",
	version: 1,
	title: "MELONJS",
	subtitle: "TWELVE SECONDS / ONE PROCEDURAL TAKE",
	duration: DURATION,
	fps: FPS,
	layers: [
		{
			id: "ripple",
			name: "Ripple field",
			kind: "PROCEDURAL / 2D",
			visible: true,
			tracks: {
				position: [
					k(0, { x: 0, y: 14 }),
					k(4.5, { x: -10, y: -10 }),
					k(9, { x: 12, y: 4 }),
					k(12, { x: 0, y: 0 }),
				],
				scale: [k(0, 0.9), k(3.5, 1.02), k(8, 1.1), k(12, 1)],
				opacity: [k(0, 0.45), k(2, 0.92), k(10.5, 0.82), k(12, 0.35)],
				color: [
					k(0, "#15656b"),
					k(4, "#1a8a84"),
					k(8, "#126378"),
					k(12, "#0c3e55"),
				],
			},
		},
		{
			id: "title",
			name: "Title / MELONJS",
			kind: "SYSTEM FONT / COMPOSITE",
			visible: true,
			tracks: {
				position: [
					k(0, { x: 0, y: 42 }),
					k(2.6, { x: 0, y: -12 }),
					k(6, { x: 0, y: 0 }),
					k(12, { x: 0, y: -3 }),
				],
				scale: [k(0, 0.86), k(3.4, 1), k(6, 1.025), k(12, 1.05)],
				opacity: [k(0.65, 0), k(1.05, 0), k(3.55, 1), k(11.15, 1), k(11.85, 0)],
				color: [
					k(0.8, "#8fe5cc"),
					k(3.4, "#ecfff8"),
					k(7.2, "#f3ffe7"),
					k(11.5, "#a9f5e7"),
				],
			},
		},
		{
			id: "light",
			name: "Light sweeps",
			kind: "ADDITIVE / FOREGROUND",
			visible: true,
			tracks: {
				position: [
					k(0, { x: -150, y: 24 }),
					k(2.7, { x: 105, y: -18 }),
					k(6.2, { x: -80, y: 10 }),
					k(9.2, { x: 120, y: -22 }),
					k(12, { x: 260, y: 8 }),
				],
				scale: [k(0, 0.72), k(3, 1.02), k(7, 1.12), k(12, 0.96)],
				opacity: [
					k(0, 0.1),
					k(2.2, 0.7),
					k(6.5, 0.55),
					k(9.4, 0.9),
					k(12, 0.18),
				],
				color: [
					k(0, "#74e4d0"),
					k(3, "#b9ffe8"),
					k(6.2, "#ffc96e"),
					k(9.4, "#e8fff4"),
					k(12, "#59b9c7"),
				],
			},
		},
	],
});

export const cloneProject = (project: Project): Project => ({
	...project,
	layers: project.layers.map((layer) => ({
		...layer,
		tracks: {
			position: layer.tracks.position.map((key) => ({
				...key,
				value: { ...key.value },
			})),
			scale: layer.tracks.scale.map((key) => ({ ...key })),
			opacity: layer.tracks.opacity.map((key) => ({ ...key })),
			color: layer.tracks.color.map((key) => ({ ...key })),
		},
	})),
});

export const projectJSON = (project: Project): string =>
	`${JSON.stringify(project, null, "\t")}\n`;

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const number = (value: unknown, fallback: number): number =>
	typeof value === "number" && Number.isFinite(value) ? value : fallback;

const color = (value: unknown, fallback: string): string =>
	typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
		? value.toLowerCase()
		: fallback;

const readKeys = <T>(
	value: unknown,
	read: (raw: Record<string, unknown>, fallback: T) => T,
	fallback: T,
): Keyframe<T>[] => {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.filter(isObject)
		.map((raw) => ({
			id: typeof raw.id === "string" && raw.id ? raw.id : keyId(),
			time: clamp(snapTime(number(raw.time, 0)), 0, DURATION),
			value: read(raw, fallback),
		}))
		.sort((a, b) => a.time - b.time);
};

/**
 * Read a saved project, keeping only values the editor can represent.
 * Invalid layers fall back to the default composition.
 */
export const parseProject = (text: string): Project => {
	const fallback = createDefaultProject();
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("That file is not valid JSON.");
	}
	if (!isObject(raw) || raw.format !== fallback.format) {
		throw new Error("That JSON is not a procedural intro project.");
	}
	const savedLayers = Array.isArray(raw.layers) ? raw.layers : [];
	const layers = fallback.layers.map((base) => {
		const found = savedLayers.find(
			(layer) => isObject(layer) && layer.id === base.id,
		);
		if (!isObject(found) || !isObject(found.tracks)) {
			return base;
		}
		const tracks = found.tracks;
		const position = readKeys<Vec2>(
			tracks.position,
			(key, value) => {
				const rawValue = isObject(key.value) ? key.value : {};
				return {
					x: clamp(number(rawValue.x, value.x), -640, 640),
					y: clamp(number(rawValue.y, value.y), -360, 360),
				};
			},
			{ x: 0, y: 0 },
		);
		const scale = readKeys<number>(
			tracks.scale,
			(key, value) => clamp(number(key.value, value), 0.05, 4),
			1,
		);
		const opacity = readKeys<number>(
			tracks.opacity,
			(key, value) => clamp(number(key.value, value), 0, 1),
			1,
		);
		const layerColor = readKeys<string>(
			tracks.color,
			(key, value) => color(key.value, value),
			"#d9fff4",
		);
		return {
			...base,
			name: typeof found.name === "string" ? found.name : base.name,
			visible: typeof found.visible === "boolean" ? found.visible : true,
			tracks: { position, scale, opacity, color: layerColor },
		};
	});
	return {
		format: fallback.format,
		version: 1,
		title:
			typeof raw.title === "string" ? raw.title.slice(0, 48) : fallback.title,
		subtitle:
			typeof raw.subtitle === "string"
				? raw.subtitle.slice(0, 96)
				: fallback.subtitle,
		duration: DURATION,
		fps: FPS,
		layers,
	};
};

export interface KeyLocation {
	layerId: LayerId;
	track: TrackId;
	keyId: string;
}

/** Replace or insert a keyframe, returning a new project. */
export const writeKey = <T>(
	project: Project,
	layerId: LayerId,
	track: TrackId,
	time: number,
	value: T,
): Project => {
	return {
		...project,
		layers: project.layers.map((layer) => {
			if (layer.id !== layerId) {
				return layer;
			}
			const keys = sortTracks(layer).tracks[track] as Keyframe<T>[];
			const existing = keyAt(keys, snapTime(time));
			const next = existing
				? keys.map((key) =>
						key.id === existing.id
							? { ...key, value, time: snapTime(time) }
							: key,
					)
				: [...keys, { id: keyId(), time: snapTime(time), value }];
			return {
				...layer,
				tracks: {
					...layer.tracks,
					[track]: next,
				},
			} as Layer;
		}),
	};
};

export const moveKey = (
	project: Project,
	location: KeyLocation,
	time: number,
): Project => {
	return {
		...project,
		layers: project.layers.map((layer) => {
			if (layer.id !== location.layerId) {
				return layer;
			}
			const keys = layer.tracks[location.track];
			const next = keys.map((key) =>
				key.id === location.keyId ? { ...key, time: snapTime(time) } : key,
			);
			return {
				...layer,
				tracks: {
					...layer.tracks,
					[location.track]: next,
				},
			} as Layer;
		}),
	};
};

export const removeKey = (
	project: Project,
	location: KeyLocation,
): Project => ({
	...project,
	layers: project.layers.map((layer) => {
		if (layer.id !== location.layerId) {
			return layer;
		}
		const keys = layer.tracks[location.track] as Keyframe<unknown>[];
		return {
			...layer,
			tracks: {
				...layer.tracks,
				[location.track]: keys.filter((key) => key.id !== location.keyId),
			},
		} as Layer;
	}),
});
