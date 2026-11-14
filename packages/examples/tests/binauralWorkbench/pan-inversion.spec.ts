import { describe, expect, it } from "vitest";
import {
	computeSpatialCues,
	equalPowerLeft,
	equalPowerRight,
	interauralTimeDifference,
} from "../../src/examples/binauralWorkbench/acoustics";
import type { SpatialState } from "../../src/examples/binauralWorkbench/types";

/**
 * Two hand-constructed listener positions in the same room, with the
 * source fixed. The listener is mirrored across the source's x axis,
 * so the apparent left/right position must invert exactly while
 * distance stays identical.
 */
const source = { x: 5, y: 4 };
const listenerOnTheRight = { x: 8, y: 4 };
const listenerOnTheLeft = { x: 2, y: 4 };

const stateAt = (listener: { x: number; y: number }): SpatialState => ({
	source,
	listener,
	// facing the front wall (toward y = 0)
	listenerHeading: -Math.PI / 2,
});

describe("binaural pan inversion", () => {
	it("places a source on the listener's left when the listener stands to its right", () => {
		const cues = computeSpatialCues(stateAt(listenerOnTheRight));
		expect(cues.pan).toBeLessThan(0);
		expect(cues.azimuth).toBeLessThan(0);
		expect(cues.distance).toBeCloseTo(3, 6);
	});

	it("places the same source on the right when the listener stands mirrored on the left", () => {
		const cues = computeSpatialCues(stateAt(listenerOnTheLeft));
		expect(cues.pan).toBeGreaterThan(0);
		expect(cues.azimuth).toBeGreaterThan(0);
		expect(cues.distance).toBeCloseTo(3, 6);
	});

	it("inverts the pan sign and channel gains between the two positions", () => {
		const rightSide = computeSpatialCues(stateAt(listenerOnTheRight));
		const leftSide = computeSpatialCues(stateAt(listenerOnTheLeft));

		expect(rightSide.pan).toBeCloseTo(-leftSide.pan, 10);
		expect(rightSide.azimuth).toBeCloseTo(-leftSide.azimuth, 10);

		// The channel that dominates must swap: right-side listener
		// hears the source louder in the left ear and vice versa.
		expect(equalPowerLeft(rightSide.pan)).toBeGreaterThan(
			equalPowerRight(rightSide.pan),
		);
		expect(equalPowerRight(leftSide.pan)).toBeGreaterThan(
			equalPowerLeft(leftSide.pan),
		);
		expect(equalPowerLeft(rightSide.pan)).toBeCloseTo(
			equalPowerRight(leftSide.pan),
			10,
		);
	});

	it("inverts the interaural time difference sign as well", () => {
		const rightSide = computeSpatialCues(stateAt(listenerOnTheRight));
		const leftSide = computeSpatialCues(stateAt(listenerOnTheLeft));
		expect(interauralTimeDifference(rightSide.azimuth)).toBeCloseTo(
			-interauralTimeDifference(leftSide.azimuth),
			10,
		);
	});
});
