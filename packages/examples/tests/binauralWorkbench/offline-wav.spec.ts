import { describe, expect, it } from "vitest";
import { BinauralAudioEngine } from "../../src/examples/binauralWorkbench/audioEngine";
import {
	sourceOrbitPosition,
	type TimedPoint,
} from "../../src/examples/binauralWorkbench/trajectory";
import { WALL_MATERIALS } from "../../src/examples/binauralWorkbench/types";
import {
	channelHasSignal,
	encodeWav,
} from "../../src/examples/binauralWorkbench/wav";

const room = { width: 6, depth: 5, height: 3 };
const material = WALL_MATERIALS[1];
const sampleRate = 44100;

/** a short path sweeping the listener from left to right */
const buildTrajectory = (): TimedPoint[] => {
	const points: TimedPoint[] = [];
	for (let i = 0; i <= 20; i += 1) {
		const t = i * 0.25;
		points.push({
			time: t,
			point: {
				x: 1.5 + (3 * i) / 20,
				y: 3.5,
			},
		});
	}
	return points;
};

const renderClip = () =>
	BinauralAudioEngine.renderOffline({
		room,
		material,
		mode: "binaural",
		durationSec: 5,
		sampleRate,
		trajectory: buildTrajectory(),
		sourceAt: (time) => sourceOrbitPosition(room, time),
		heading: 0,
	});

describe("offline WAV rendering", () => {
	it("renders a stereo buffer with signal in both channels", async () => {
		const rendered = await renderClip();
		expect(rendered.numberOfChannels).toBe(2);
		expect(rendered.length).toBe(5 * sampleRate);

		const left = rendered.getChannelData(0);
		const right = rendered.getChannelData(1);
		expect(channelHasSignal(left)).toBe(true);
		expect(channelHasSignal(right)).toBe(true);
	});

	it("encodes a 44-byte-header stereo 16-bit PCM WAV with no missing channel", async () => {
		const rendered = await renderClip();
		const left = rendered.getChannelData(0);
		const right = rendered.getChannelData(1);
		const blob = encodeWav(sampleRate, [left, right]);

		const bytes = new Uint8Array(await blob.arrayBuffer());
		const view = new DataView(bytes.buffer);

		// RIFF / WAVE structure
		expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("RIFF");
		expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("WAVE");
		expect(String.fromCharCode(...bytes.slice(12, 16))).toBe("fmt ");
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(2); // stereo
		expect(view.getUint32(24, true)).toBe(sampleRate);
		expect(view.getUint16(34, true)).toBe(16); // bit depth
		expect(String.fromCharCode(...bytes.slice(36, 40))).toBe("data");

		const dataSize = view.getUint32(40, true);
		expect(dataSize).toBe(left.length * 2 * 2);
		expect(bytes.length).toBe(44 + dataSize);

		// Decode the PCM back and confirm neither channel is silent.
		let leftPeak = 0;
		let rightPeak = 0;
		for (let frame = 0; frame < left.length; frame += 1) {
			const offset = 44 + frame * 4;
			leftPeak = Math.max(leftPeak, Math.abs(view.getInt16(offset, true)));
			rightPeak = Math.max(
				rightPeak,
				Math.abs(view.getInt16(offset + 2, true)),
			);
		}
		expect(leftPeak).toBeGreaterThan(100);
		expect(rightPeak).toBeGreaterThan(100);
	});
});
