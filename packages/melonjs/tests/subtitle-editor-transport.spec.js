/**
 * melonJS — subtitle editor example: the shared time base.
 *
 * The Transport is what keeps picture, playhead and cues on one clock. These
 * specs drive it against a fake HTMLVideoElement (the frame/audio source the
 * editor reconciles), proving playback advances a single time, scrubbing
 * repositions the source, looping wraps, and cue switching follows time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	activeCue,
	createCue,
	defaultCues,
	TIMELINE_DURATION,
} from "../../examples/src/examples/subtitleEditor/cues.ts";
import { Transport } from "../../examples/src/examples/subtitleEditor/transport.ts";

/** minimal HTMLVideoElement stand-in with the members Transport touches */
class FakeVideo {
	constructor() {
		this.duration = 10;
	}

	currentTime = 0;

	duration = 10;

	paused = true;

	play = vi.fn(() => {
		this.paused = false;
		return Promise.resolve();
	});

	pause = vi.fn(() => {
		this.paused = true;
	});

	removeAttribute() {}

	load() {}
}

describe("subtitle editor: Transport time base", () => {
	let rafQueue;
	let originalRaf;
	let now;

	beforeEach(() => {
		rafQueue = [];
		now = 1000;
		originalRaf = globalThis.requestAnimationFrame;
		globalThis.requestAnimationFrame = (callback) => {
			rafQueue.push(callback);
			return rafQueue.length;
		};
		globalThis.performance = {
			now: () => {
				return now;
			},
		};
	});

	afterEach(() => {
		globalThis.requestAnimationFrame = originalRaf;
	});

	/** advance the fake rAF loop by `frames` frames of ~16.67 ms */
	const runFrames = (frames) => {
		for (let i = 0; i < frames; i++) {
			now += 1000 / 60;
			const callback = rafQueue.shift();
			callback?.(now);
		}
	};

	it("starts paused at time zero and reports one authoritative time", () => {
		const video = new FakeVideo();
		const transport = new Transport(video);
		expect(transport.time).toBe(0);
		expect(transport.isPlaying).toBe(false);
		transport.destroy();
	});

	it("advances a single clock while playing and hard-syncs the looping source", async () => {
		const video = new FakeVideo();
		const seeks = [];
		const transport = new Transport(video, {
			seek: (t) => {
				return seeks.push(t);
			},
		});

		transport.play();
		expect(video.play).toHaveBeenCalledOnce();

		// play 30 frames (~0.5 s): the timeline advances by wall-clock time
		runFrames(30);
		expect(transport.time).toBeGreaterThan(0.4);
		expect(transport.time).toBeLessThan(0.6);

		// the 10 s source is reconciled to the same timeline position
		expect(Math.abs(video.currentTime - transport.time)).toBeLessThan(0.1);
		expect(seeks.length).toBeGreaterThan(0);

		transport.pause();
		const frozen = transport.time;
		runFrames(10);
		expect(transport.time).toBe(frozen);
		expect(video.pause).toHaveBeenCalled();
		transport.destroy();
	});

	it("scrubbing repositions both the playhead time and the video frame", () => {
		const video = new FakeVideo();
		const transport = new Transport(video);

		transport.seekTo(25.4);
		expect(transport.time).toBe(25.4);
		// the source clip loops: 25.4 s on the timeline maps into its 10 s window
		expect(video.currentTime).toBeCloseTo(5.4, 5);

		transport.seekTo(8);
		expect(video.currentTime).toBe(8);
		transport.destroy();
	});

	it("keeps the picture and the waveform time base aligned across loop wraps", () => {
		const video = new FakeVideo();
		const transport = new Transport(video);
		// every timeline position maps to the same fractional position inside
		// the 10 s source: waveform tiling and video frames share this mapping
		transport.seekTo(12.3);
		expect(video.currentTime).toBeCloseTo(2.3, 5);
		transport.seekTo(32.3);
		expect(video.currentTime).toBeCloseTo(2.3, 5);
		transport.destroy();
	});

	it("wraps playback at the loop boundary and keeps cues in sync", () => {
		const video = new FakeVideo();
		const transport = new Transport(video);
		const cues = [
			createCue(2, 3, "inside the loop"),
			...defaultCues().filter((cue) => {
				return cue.start >= 5;
			}),
		];

		transport.seekTo(2.2);
		expect(activeCue(cues, transport.time)?.text).toBe("inside the loop");

		transport.setLoopRange({ start: 2, end: 2.8 });
		transport.play();
		// run long enough to cross the 2.8 s end of the loop range
		runFrames(60);
		expect(transport.time).toBeGreaterThanOrEqual(2);
		expect(transport.time).toBeLessThan(2.8);
		// after wrapping, the same cue is still active — nothing runs away
		expect(activeCue(cues, transport.time)?.text).toBe("inside the loop");
		transport.destroy();
	});

	it("stops at the end of the 40 s timeline instead of overrunning", () => {
		const video = new FakeVideo();
		const transport = new Transport(video);
		transport.seekTo(TIMELINE_DURATION - 0.1);
		transport.play();
		runFrames(120);
		expect(transport.time).toBe(TIMELINE_DURATION);
		expect(transport.isPlaying).toBe(false);
		transport.destroy();
	});
});
