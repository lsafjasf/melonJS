/**
 * melonJS — subtitle editor: WebVTT export and import.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Only the subset the editor writes is parsed back: a `WEBVTT` header,
 * optional cue settings we don't produce, and `HH:MM:SS.mmm --> HH:MM:SS.mmm`
 * timing lines followed by one or more text lines. Timestamps accept a
 * comma decimal separator too, since some tools export SRT-style values
 * inside .vtt files.
 */
import { type Cue, createCue, formatTimestamp, sortedCues } from "./cues";

const HEADER = "WEBVTT";

/**
 * Serialize cues to a WebVTT document. Cues are emitted in playback order so
 * a re-import keeps the same order even when the editor list was unsorted.
 */
export const toVTT = (cues: Cue[]): string => {
	const blocks = sortedCues(cues).map((cue, index) => {
		return [
			`${index + 1}`,
			`${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}`,
			cue.text,
		].join("\n");
	});
	return `${HEADER}\n\n${blocks.join("\n\n")}\n`;
};

/** parse a `MM:SS.mmm` or `HH:MM:SS.mmm` timestamp, comma or dot decimal */
const parseTimestamp = (raw: string): number => {
	const match = raw
		.trim()
		.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
	if (!match) {
		throw new Error(`Bad VTT timestamp: "${raw.trim()}"`);
	}
	const [, hours, minutes, seconds, fraction] = match;
	const millis = fraction ? Number(fraction.padEnd(3, "0")) : 0;
	return (
		Number(hours ?? 0) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		millis / 1000
	);
};

const TIMING_LINE =
	/^(\d{1,2}:\d{2}[.,]\d{1,3}|\d+:\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}[.,]\d{1,3}|\d+:\d{1,2}:\d{2}[.,]\d{1,3})(?:\s|$)/;

/**
 * Parse a WebVTT document back into cues. Throws with a readable message on
 * a missing header or a timing line that cannot be read, so the UI can show
 * why an import was rejected.
 */
export const fromVTT = (content: string): Cue[] => {
	const normalized = content.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
	const blocks = normalized.split(/\n{2,}/).map((block) => block.trim());

	const headerBlock = blocks.find((block) => block.length > 0);
	if (!headerBlock?.startsWith(HEADER)) {
		throw new Error(
			"Not a WebVTT file: the document must start with 'WEBVTT'.",
		);
	}

	const cues: Cue[] = [];
	for (const block of blocks) {
		const lines = block.split("\n");
		const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
		if (timingIndex === -1) {
			// header, NOTE blocks and cue identifiers without a body: skip
			continue;
		}
		const timingMatch = lines[timingIndex].match(TIMING_LINE);
		if (!timingMatch) {
			throw new Error(`Unreadable timing line: "${lines[timingIndex]}"`);
		}
		const start = parseTimestamp(timingMatch[1]);
		const end = parseTimestamp(timingMatch[2]);
		const text = lines
			.slice(timingIndex + 1)
			.join("\n")
			.trim();
		if (end <= start) {
			throw new Error(
				`Cue ending at ${formatTimestamp(end)} must be longer than its start.`,
			);
		}
		cues.push(createCue(start, end, text));
	}

	if (cues.length === 0) {
		throw new Error("The WebVTT file contains no cues.");
	}
	return cues;
};

/** read a .vtt File picked by the user into cues */
export const readVTTFile = async (file: File): Promise<Cue[]> => {
	return fromVTT(await file.text());
};

/** offer the VTT text as a browser download */
export const downloadVTT = (cues: Cue[], filename = "subtitles.vtt"): void => {
	const blob = new Blob([toVTT(cues)], { type: "text/vtt;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
};
