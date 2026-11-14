/**
 * melonJS — subtitle editor example: pure cue and WebVTT logic.
 *
 * These specs cover the example's framework-free modules (cue math, overlap
 * detection, VTT round-trip), so they run in the browser runner alongside
 * the engine specs without booting the engine itself.
 */
import { describe, expect, it } from "vitest";
import {
	activeCue,
	canSave,
	createCue,
	defaultCues,
	moveCue,
	nudgeCueEdge,
	overlappingIds,
	quantize,
	resizeCue,
	TIME_STEP,
	TIMELINE_DURATION,
} from "../../examples/src/examples/subtitleEditor/cues.ts";
import {
	fromVTT,
	toVTT,
} from "../../examples/src/examples/subtitleEditor/vtt.ts";

describe("subtitle editor: cue model", () => {
	it("ships six default cues spanning the 40 s timeline", () => {
		const cues = defaultCues();
		expect(cues).toHaveLength(6);
		expect(cues[0].start).toBeGreaterThanOrEqual(0);
		expect(cues[5].end).toBeLessThanOrEqual(TIMELINE_DURATION);
		expect(TIMELINE_DURATION).toBe(40);
	});

	it("quantizes times to the frame step and clamps to the timeline", () => {
		expect(quantize(1.23456)).toBe(1.24);
		expect(quantize(-5)).toBe(0);
		expect(quantize(99)).toBe(TIMELINE_DURATION);
	});

	it("never lets a resize invert the in and out points", () => {
		const cue = createCue(2, 5, "x");
		const inverted = resizeCue(cue, 8, 3);
		expect(inverted.end).toBeGreaterThan(inverted.start);
		expect(inverted.end - inverted.start).toBeCloseTo(TIME_STEP, 5);
	});

	it("moves a cue while preserving its length and staying on the timeline", () => {
		const cue = createCue(36, 39, "x");
		const moved = moveCue(cue, 10);
		expect(moved.end).toBeLessThanOrEqual(TIMELINE_DURATION);
		expect(moved.end - moved.start).toBe(3);

		const before = createCue(0, 2, "x");
		const pulled = moveCue(before, -10);
		expect(pulled.start).toBe(0);
	});

	it("nudges an edge by whole frame steps", () => {
		const cue = createCue(4, 8, "x");
		const later = nudgeCueEdge(cue, "start", 2);
		expect(later.start).toBeCloseTo(4 + TIME_STEP * 2, 5);
		expect(later.end).toBe(8);
	});

	it("flags only the cues that actually overlap", () => {
		const a = createCue(0, 2, "a");
		const b = createCue(2, 4, "b");
		const c = createCue(3, 5, "c");
		const flagged = overlappingIds([a, b, c]);
		expect(flagged.has(a.id)).toBe(false);
		expect(flagged.has(b.id)).toBe(true);
		expect(flagged.has(c.id)).toBe(true);
		expect(canSave([a, b, c])).toBe(false);
		expect(canSave([a, b])).toBe(true);
	});

	it("treats touching half-open ranges as valid", () => {
		const cues = [createCue(0, 1, "a"), createCue(1, 2, "b")];
		expect(overlappingIds(cues).size).toBe(0);
	});

	it("resolves the active cue with half-open [start, end) ranges", () => {
		const cues = [createCue(1, 2, "a"), createCue(2, 3, "b")];
		expect(activeCue(cues, 1.5)?.text).toBe("a");
		// half-open ranges: exactly 2.0 is outside cue a and inside cue b
		expect(activeCue(cues, 2)?.text).toBe("b");
		expect(activeCue(cues, 2 + TIME_STEP)?.text).toBe("b");
		expect(activeCue(cues, 2.5)?.text).toBe("b");
		expect(activeCue(cues, 40)).toBeUndefined();
	});
});

describe("subtitle editor: WebVTT round-trip", () => {
	it("exports then re-imports the six cues with identical text, order and times", () => {
		const original = defaultCues();
		const document = toVTT(original);
		expect(document.startsWith("WEBVTT\n")).toBe(true);

		const reimported = fromVTT(document);
		expect(reimported).toHaveLength(6);

		const expected = original.toSorted((a, b) => {
			return a.start - b.start;
		});
		reimported.forEach((cue, index) => {
			expect(cue.text).toBe(expected[index].text);
			expect(cue.start).toBeCloseTo(expected[index].start, 3);
			expect(cue.end).toBeCloseTo(expected[index].end, 3);
		});
		// the round trip leaves an exportable, non-overlapping document
		expect(canSave(reimported)).toBe(true);
	});

	it("preserves multi-line cue text and millisecond timestamps", () => {
		const cues = [createCue(1.52, 3.24, "line one\nline two")];
		const reimported = fromVTT(toVTT(cues));
		expect(reimported[0].text).toBe("line one\nline two");
		expect(reimported[0].start).toBeCloseTo(1.52, 3);
		expect(reimported[0].end).toBeCloseTo(3.24, 3);
	});

	it("accepts comma decimals and cue identifiers written by other tools", () => {
		const foreign = [
			"WEBVTT",
			"",
			"cue-1",
			"00:00:01,000 --> 00:00:02,500",
			"hello",
		].join("\n");
		const cues = fromVTT(foreign);
		expect(cues).toHaveLength(1);
		expect(cues[0].text).toBe("hello");
		expect(cues[0].start).toBe(1);
		// 2.5 s lands between frame steps, so it is stored quantized
		expect(cues[0].end).toBeCloseTo(2.52, 3);
	});

	it("rejects documents that are not WebVTT", () => {
		expect(() => {
			return fromVTT("1\n00:00:01 --> 00:00:02\nnope");
		}).toThrow(/WEBVTT/);
	});

	it("rejects cues whose out point is not after the in point", () => {
		const bad = "WEBVTT\n\n00:00:05.000 --> 00:00:04.000\nreversed";
		expect(() => {
			return fromVTT(bad);
		}).toThrow();
	});
});
