/**
 * melonJS — layered compositor project model.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const DURATION = 12;
export const FPS = 30;
export const TOTAL_FRAMES = DURATION * FPS;

export const TRACK_IDS = ["dust", "buildings", "fog"] as const;
export const PROPERTY_IDS = ["offset", "blur", "color", "opacity"] as const;

export type TrackId = (typeof TRACK_IDS)[number];
export type PropertyId = (typeof PROPERTY_IDS)[number];
export type OffsetValue = { x: number; y: number };
export type KeyframeValue = number | string | OffsetValue;

export interface Keyframe {
	frame: number;
	value: KeyframeValue;
}

export interface CompositorTrack {
	id: TrackId;
	name: string;
	accent: string;
	keyframes: Record<PropertyId, Keyframe[]>;
}

export interface CompositorProject {
	version: 1;
	name: string;
	duration: number;
	fps: number;
	tracks: CompositorTrack[];
}

export const PROPERTY_META: Record<
	PropertyId,
	{ label: string; short: string; color: string }
> = {
	offset: { label: "Displacement", short: "MOVE", color: "#58c7ff" },
	blur: { label: "Blur", short: "BLUR", color: "#c69bff" },
	color: { label: "Color", short: "COLOR", color: "#ffbd66" },
	opacity: { label: "Opacity", short: "ALPHA", color: "#7fe6b2" },
};

export const TRACK_META: Record<
	TrackId,
	{ name: string; accent: string; defaults: Record<PropertyId, KeyframeValue> }
> = {
	dust: {
		name: "Foreground dust",
		accent: "#ffd39a",
		defaults: {
			offset: { x: 0, y: 0 },
			blur: 0,
			color: "#ffdca8",
			opacity: 0.85,
		},
	},
	buildings: {
		name: "Building silhouettes",
		accent: "#7da7d9",
		defaults: {
			offset: { x: 0, y: 0 },
			blur: 0.4,
			color: "#526b8f",
			opacity: 1,
		},
	},
	fog: {
		name: "Distant fog",
		accent: "#9ab9ca",
		defaults: {
			offset: { x: -10, y: 0 },
			blur: 9,
			color: "#89a4ba",
			opacity: 0.78,
		},
	},
};

const keyframe = (frame: number, value: KeyframeValue): Keyframe => {
	return { frame, value };
};

const makeTrack = (
	id: TrackId,
	keyframes: Record<PropertyId, Keyframe[]>,
): CompositorTrack => {
	return {
		id,
		name: TRACK_META[id].name,
		accent: TRACK_META[id].accent,
		keyframes,
	};
};

export const createDefaultProject = (): CompositorProject => {
	return {
		version: 1,
		name: "Twelve Second Fog",
		duration: DURATION,
		fps: FPS,
		tracks: [
			makeTrack("dust", {
				offset: [
					keyframe(0, { x: 0, y: 0 }),
					keyframe(120, { x: 24, y: -12 }),
					keyframe(240, { x: -14, y: 10 }),
					keyframe(360, { x: 0, y: 0 }),
				],
				blur: [
					keyframe(0, 0),
					keyframe(120, 3.5),
					keyframe(240, 1.2),
					keyframe(360, 0),
				],
				color: [
					keyframe(0, "#ffd39a"),
					keyframe(180, "#fff2cf"),
					keyframe(360, "#ffd39a"),
				],
				opacity: [
					keyframe(0, 0.5),
					keyframe(90, 0.95),
					keyframe(300, 0.72),
					keyframe(360, 0.5),
				],
			}),
			makeTrack("buildings", {
				offset: [
					keyframe(0, { x: 0, y: 0 }),
					keyframe(150, { x: 10, y: -2 }),
					keyframe(300, { x: -8, y: 2 }),
					keyframe(360, { x: 0, y: 0 }),
				],
				blur: [keyframe(0, 0.4), keyframe(200, 1.8), keyframe(360, 0.4)],
				color: [
					keyframe(0, "#526b8f"),
					keyframe(180, "#8b79a8"),
					keyframe(360, "#526b8f"),
				],
				opacity: [keyframe(0, 0.82), keyframe(240, 1), keyframe(360, 0.82)],
			}),
			makeTrack("fog", {
				offset: [
					keyframe(0, { x: -10, y: 0 }),
					keyframe(180, { x: 8, y: 4 }),
					keyframe(360, { x: -10, y: 0 }),
				],
				blur: [keyframe(0, 8), keyframe(180, 15), keyframe(360, 8)],
				color: [
					keyframe(0, "#7898b6"),
					keyframe(240, "#b48c91"),
					keyframe(360, "#7898b6"),
				],
				opacity: [keyframe(0, 0.66), keyframe(180, 0.9), keyframe(360, 0.66)],
			}),
		],
	};
};

export const getTrack = (
	project: CompositorProject,
	id: TrackId,
): CompositorTrack => {
	const track = project.tracks.find((candidate) => {
		return candidate.id === id;
	});
	if (!track) {
		throw new Error(`track "${id}" is missing`);
	}
	return track;
};

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(Math.max(value, min), max);
};

const smooth = (value: number): number => {
	return value * value * (3 - 2 * value);
};

export const parseHex = (value: string): [number, number, number] => {
	const match = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
	if (!match) {
		return [255, 255, 255];
	}
	const hex =
		match[1].length === 3
			? match[1]
					.split("")
					.map((part) => {
						return part + part;
					})
					.join("")
			: match[1];
	return [
		Number.parseInt(hex.slice(0, 2), 16),
		Number.parseInt(hex.slice(2, 4), 16),
		Number.parseInt(hex.slice(4, 6), 16),
	];
};

export const toHex = (rgb: [number, number, number]): string => {
	return `#${rgb
		.map((channel) => {
			return Math.round(clamp(channel, 0, 255))
				.toString(16)
				.padStart(2, "0");
		})
		.join("")}`;
};

const mixColor = (from: string, to: string, amount: number): string => {
	const a = parseHex(from);
	const b = parseHex(to);
	return toHex([
		a[0] + (b[0] - a[0]) * amount,
		a[1] + (b[1] - a[1]) * amount,
		a[2] + (b[2] - a[2]) * amount,
	]);
};

const mixValue = (
	property: PropertyId,
	from: KeyframeValue,
	to: KeyframeValue,
	amount: number,
): KeyframeValue => {
	if (property === "color") {
		return mixColor(String(from), String(to), amount);
	}
	if (property === "offset") {
		const a = from as OffsetValue;
		const b = to as OffsetValue;
		return {
			x: a.x + (b.x - a.x) * amount,
			y: a.y + (b.y - a.y) * amount,
		};
	}
	return Number(from) + (Number(to) - Number(from)) * amount;
};

export const sampleProperty = <P extends PropertyId>(
	track: CompositorTrack,
	property: P,
	time: number,
	fps: number,
	duration: number,
): KeyframeValue => {
	const keyframes = track.keyframes[property];
	if (keyframes.length === 0) {
		return TRACK_META[track.id].defaults[property];
	}

	const frame = clamp(time, 0, duration) * fps;
	const first = keyframes[0];
	const last = keyframes[keyframes.length - 1];
	if (frame <= first.frame) {
		return first.value;
	}
	if (frame >= last.frame) {
		return last.value;
	}

	for (let index = 1; index < keyframes.length; index++) {
		const next = keyframes[index];
		if (frame <= next.frame) {
			const previous = keyframes[index - 1];
			const span = next.frame - previous.frame;
			const linear = span === 0 ? 1 : (frame - previous.frame) / span;
			return mixValue(
				property,
				previous.value,
				next.value,
				smooth(clamp(linear, 0, 1)),
			);
		}
	}
	return last.value;
};

export const getKeyframeAtFrame = (
	track: CompositorTrack,
	property: PropertyId,
	frame: number,
): Keyframe | undefined => {
	return track.keyframes[property].find((candidate) => {
		return candidate.frame === frame;
	});
};

export const upsertKeyframe = (
	project: CompositorProject,
	trackId: TrackId,
	property: PropertyId,
	frame: number,
	value: KeyframeValue,
): CompositorProject => {
	const clampedFrame = Math.round(
		clamp(frame, 0, Math.round(project.duration * project.fps)),
	);
	return {
		...project,
		tracks: project.tracks.map((track) => {
			if (track.id !== trackId) {
				return track;
			}
			const existing = track.keyframes[property].filter((candidate) => {
				return candidate.frame !== clampedFrame;
			});
			return {
				...track,
				keyframes: {
					...track.keyframes,
					[property]: [...existing, keyframe(clampedFrame, value)].sort(
						(a, b) => {
							return a.frame - b.frame;
						},
					),
				},
			};
		}),
	};
};

export const removeKeyframeAtFrame = (
	project: CompositorProject,
	trackId: TrackId,
	property: PropertyId,
	frame: number,
): CompositorProject => {
	return {
		...project,
		tracks: project.tracks.map((track) => {
			if (track.id !== trackId) {
				return track;
			}
			return {
				...track,
				keyframes: {
					...track.keyframes,
					[property]: track.keyframes[property].filter((candidate) => {
						return candidate.frame !== frame;
					}),
				},
			};
		}),
	};
};

export const countKeyframes = (project: CompositorProject): number => {
	return project.tracks.reduce((total, track) => {
		return (
			total +
			PROPERTY_IDS.reduce((trackTotal, property) => {
				return trackTotal + track.keyframes[property].length;
			}, 0)
		);
	}, 0);
};

export const serializeProject = (project: CompositorProject): string => {
	return JSON.stringify(project, null, 2);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === "object" && value !== null && !Array.isArray(value);
};

const normalizeValue = (
	property: PropertyId,
	value: unknown,
): KeyframeValue => {
	if (property === "color") {
		if (typeof value !== "string" || value.trim() === "") {
			throw new Error("color keyframes need a CSS color string");
		}
		return value;
	}
	if (property === "offset") {
		if (
			!isRecord(value) ||
			typeof value.x !== "number" ||
			typeof value.y !== "number" ||
			!Number.isFinite(value.x) ||
			!Number.isFinite(value.y)
		) {
			throw new Error("displacement keyframes need finite x and y values");
		}
		return { x: value.x, y: value.y };
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${property} keyframes need a finite number`);
	}
	if (property === "opacity") {
		return clamp(value, 0, 1);
	}
	if (property === "blur") {
		return clamp(value, 0, 40);
	}
	return value;
};

const normalizeKeyframes = (
	value: unknown,
	property: PropertyId,
	totalFrames: number,
): Keyframe[] => {
	if (value === undefined) {
		return [];
	}
	if (!Array.isArray(value)) {
		throw new Error(`${property} keyframes must be an array`);
	}
	const byFrame = new Map<number, Keyframe>();
	for (const candidate of value) {
		if (!isRecord(candidate)) {
			throw new Error(`${property} has an invalid keyframe`);
		}
		if (
			typeof candidate.frame !== "number" ||
			!Number.isFinite(candidate.frame)
		) {
			throw new Error(`${property} keyframes need a numeric frame`);
		}
		const frame = Math.round(clamp(candidate.frame, 0, totalFrames));
		byFrame.set(frame, {
			frame,
			value: normalizeValue(property, candidate.value),
		});
	}
	return [...byFrame.values()].sort((a, b) => {
		return a.frame - b.frame;
	});
};

export const parseProject = (text: string): CompositorProject => {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error("The file is not valid JSON.");
	}
	if (!isRecord(raw)) {
		throw new Error("The project root must be an object.");
	}
	if (raw.version !== 1) {
		throw new Error("Unsupported project version; expected version 1.");
	}
	const duration =
		typeof raw.duration === "number" && Number.isFinite(raw.duration)
			? clamp(raw.duration, 1, 60)
			: DURATION;
	const fps =
		typeof raw.fps === "number" && Number.isFinite(raw.fps)
			? Math.round(clamp(raw.fps, 1, 60))
			: FPS;
	const totalFrames = Math.round(duration * fps);
	if (!Array.isArray(raw.tracks)) {
		throw new Error("The project needs a tracks array.");
	}

	const tracks = TRACK_IDS.map((id) => {
		const source = raw.tracks.find((candidate) => {
			return isRecord(candidate) && candidate.id === id;
		});
		if (!isRecord(source) || !isRecord(source.keyframes)) {
			throw new Error(`The "${id}" track is missing.`);
		}
		const keyframes = {} as Record<PropertyId, Keyframe[]>;
		for (const property of PROPERTY_IDS) {
			keyframes[property] = normalizeKeyframes(
				source.keyframes[property],
				property,
				totalFrames,
			);
		}
		return makeTrack(id, keyframes);
	});

	return {
		version: 1,
		name:
			typeof raw.name === "string" && raw.name.trim() !== ""
				? raw.name
				: "Imported compositor",
		duration,
		fps,
		tracks,
	};
};
