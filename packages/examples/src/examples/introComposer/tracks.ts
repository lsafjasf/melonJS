/**
 * melonJS — procedural intro composer: track metadata and formatting.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { LayerSample, TrackId } from "./model";

export interface TrackMeta {
	id: TrackId;
	label: string;
	code: string;
	color: string;
}

export const TRACKS: TrackMeta[] = [
	{ id: "position", label: "Position", code: "P", color: "#ffb454" },
	{ id: "scale", label: "Scale", code: "S", color: "#79e6ff" },
	{ id: "opacity", label: "Opacity", code: "O", color: "#b9f76b" },
	{ id: "color", label: "Color", code: "C", color: "#ff82b8" },
];

export const trackMeta = (id: TrackId): TrackMeta => {
	const found = TRACKS.find((track) => track.id === id);
	if (!found) {
		throw new Error(`Unknown track ${id}`);
	}
	return found;
};

export const trackValue = (
	sample: LayerSample,
	track: TrackId,
): number | string | { x: number; y: number } => sample[track];

export const formatClock = (seconds: number, frames = false): string => {
	const safe = Math.max(0, seconds);
	const whole = Math.floor(safe);
	const centiseconds = Math.floor((safe - whole) * 100);
	const frame = Math.floor((safe - whole) * 30);
	return frames
		? `${String(whole).padStart(2, "0")}:${String(frame).padStart(2, "0")}f`
		: `${String(whole).padStart(2, "0")}:${String(centiseconds).padStart(2, "0")}`;
};

export const formatSeconds = (seconds: number): string =>
	`${seconds.toFixed(2)}s`;

export const percentOf = (time: number, duration: number): number =>
	Math.min(100, Math.max(0, (time / duration) * 100));
