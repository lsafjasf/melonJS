/**
 * melonJS — subtitle editor: cue model, overlap detection and time helpers.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

/** one subtitle entry on the timeline */
export interface Cue {
	/** stable identity so React keys and drag sessions survive edits */
	id: string;
	/** in point, seconds on the shared timeline */
	start: number;
	/** out point, seconds on the shared timeline, always greater than start */
	end: number;
	/** the caption text; a single string, "\n" separates rendered lines */
	text: string;
}

/** smallest time the editor works with, in seconds (one frame at 25 fps) */
export const TIME_STEP = 0.04;

/** total length of the demo timeline, in seconds (the 40 s animation) */
export const TIMELINE_DURATION = 40;

let nextId = 1;

/** mint a cue id unique within this page session */
export const makeCueId = (): string => {
	return `cue-${nextId++}`;
};

/** clamp a time to the timeline, then round it to the editor's frame step */
export const quantize = (time: number): number => {
	const frames = Math.round(time / TIME_STEP);
	const clamped = Math.min(
		Math.round(TIMELINE_DURATION / TIME_STEP),
		Math.max(0, frames),
	);
	// round through milliseconds so 25-frame steps don't surface float noise
	return Number((clamped * TIME_STEP).toFixed(3));
};

/**
 * Create a cue, normalising its bounds. The minimum length is one frame step
 * so an in point can never reach or pass its own out point.
 */
export const createCue = (start: number, end: number, text: string): Cue => {
	const s = quantize(start);
	const e = quantize(Math.max(end, s + TIME_STEP));
	return { id: makeCueId(), start: s, end: e, text };
};

/** return a copy of the cue with a new in/out, kept ordered and on the timeline */
export const resizeCue = (cue: Cue, start: number, end: number): Cue => {
	const s = quantize(start);
	// quantize from whole frame counts so both edges use the same rounding
	const eFrames = Math.max(
		Math.round(s / TIME_STEP) + 1,
		Math.round(end / TIME_STEP),
	);
	const e = Number(
		Math.min(TIMELINE_DURATION / TIME_STEP, eFrames * TIME_STEP).toFixed(3),
	);
	if (e <= s) {
		// collapse onto a one-frame cue at the in point rather than inverting
		const endFrames = Math.min(
			Math.round(TIMELINE_DURATION / TIME_STEP),
			Math.round(s / TIME_STEP) + 1,
		);
		return {
			...cue,
			start: s,
			end: Number((endFrames * TIME_STEP).toFixed(3)),
		};
	}
	return { ...cue, start: s, end: e };
};

/**
 * Move a whole cue by `delta` seconds, preserving its length. The drag is
 * clamped at both timeline ends and quantized.
 */
export const moveCue = (cue: Cue, delta: number): Cue => {
	const length = cue.end - cue.start;
	const start = quantize(
		Math.min(TIMELINE_DURATION - length, Math.max(0, cue.start + delta)),
	);
	return { ...cue, start, end: Number((start + length).toFixed(3)) };
};

/** nudge one edge of a cue by a number of frame steps, never crossing the other edge */
export const nudgeCueEdge = (
	cue: Cue,
	edge: "start" | "end",
	steps: number,
): Cue => {
	const delta = steps * TIME_STEP;
	if (edge === "start") {
		return resizeCue(cue, cue.start + delta, cue.end);
	}
	return resizeCue(cue, cue.start, cue.end + delta);
};

/** the ids of every cue whose [start, end) overlaps another cue's range */
export const overlappingIds = (cues: Cue[]): Set<string> => {
	const flagged = new Set<string>();
	const ordered = [...cues].sort((a, b) => a.start - b.start);
	for (let i = 1; i < ordered.length; i++) {
		const previous = ordered[i - 1];
		const current = ordered[i];
		// ranges are half-open: a cue ending exactly when the next starts is fine
		if (current.start < previous.end) {
			flagged.add(previous.id);
			flagged.add(current.id);
		}
	}
	return flagged;
};

/** true when the cue list can be exported (all cues are disjoint in time) */
export const canSave = (cues: Cue[]): boolean => {
	return overlappingIds(cues).size === 0;
};

/** cues sorted in playback order, the order WebVTT must be written in */
export const sortedCues = (cues: Cue[]): Cue[] => {
	return [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
};

/** the cue active at `time`, if any — half-open [start, end) ranges */
export const activeCue = (cues: Cue[], time: number): Cue | undefined => {
	return sortedCues(cues).find((cue) => time >= cue.start && time < cue.end);
};

/** format seconds as `HH:MM:SS.mmm`, the timestamp form WebVTT requires */
export const formatTimestamp = (time: number): string => {
	const safe = Math.max(0, time);
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = Math.floor(safe % 60);
	const millis = Math.round((safe - Math.floor(safe)) * 1000);
	const pad = (value: number, width = 2): string => {
		return String(value).padStart(width, "0");
	};
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
};

/** short, human label for the ruler and edge inputs: `MM:SS.m` */
export const formatClock = (time: number): string => {
	const safe = Math.max(0, time);
	const minutes = Math.floor(safe / 60);
	const seconds = safe % 60;
	return `${String(minutes).padStart(2, "0")}:${seconds
		.toFixed(1)
		.padStart(4, "0")}`;
};

/** the six cues the editor opens with, spread across the 40 s timeline */
export const defaultCues = (): Cue[] => {
	const lines: Array<[number, number, string]> = [
		[1.0, 4.5, "Big Buck Bunny wakes up to a bright morning."],
		[6.0, 9.5, "Three rodents are plotting something nearby."],
		[11.0, 14.5, "They roll a giant fruit toward the sleeping rabbit."],
		[16.5, 20.0, "The fruit thuds into Bunny and he jolts awake."],
		[22.0, 26.5, "He chases the giggling troublemakers through the woods."],
		[29.0, 34.0, "By sunset the prank has turned into a friendship."],
	];
	return lines.map(([start, end, text]) => createCue(start, end, text));
};
