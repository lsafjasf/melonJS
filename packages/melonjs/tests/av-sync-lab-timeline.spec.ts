import { describe, expect, it } from "vitest";
import {
	BEAT_INTERVAL_SEC,
	DURATION_SEC,
	FRAME_STEP_SEC,
	MAX_OFFSET_MS,
	TimelineClock,
} from "@av-sync-lab/timeline";

/**
 * The sync lab's clock is the piece the whole premise rests on: the audio
 * lane and the visual lane read one shared clock, and the only permitted
 * divergence is the user's deliberate offset. These specs pin that math
 * down with a manually advanced fake AudioContext, so timing is
 * deterministic and needs no real audio hardware.
 */
class FakeAudioContext {
	currentTime = 0;

	advance(seconds: number): void {
		this.currentTime += seconds;
	}
}

describe("TimelineClock transport", () => {
	it("starts paused at position zero", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		expect(clock.isPlaying).toBe(false);
		expect(clock.audioTime).toBe(0);
	});

	it("advances audio time with the context clock while playing", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(1.25);
		expect(clock.audioTime).toBeCloseTo(1.25, 6);
	});

	it("freezes position while paused and resumes from the same point", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(2);
		clock.pause();
		ctx.advance(5);
		expect(clock.audioTime).toBeCloseTo(2, 6);
		clock.play();
		ctx.advance(0.5);
		expect(clock.audioTime).toBeCloseTo(2.5, 6);
	});

	it("seeks and wraps into the 20 s program from either side", () => {
		const clock = new TimelineClock(new FakeAudioContext());
		clock.seek(DURATION_SEC + 1.5);
		expect(clock.audioTime).toBeCloseTo(1.5, 6);
		clock.seek(-0.25);
		expect(clock.audioTime).toBeCloseTo(DURATION_SEC - 0.25, 6);
	});

	it("frame step advances exactly one frame and stays paused", () => {
		const clock = new TimelineClock(new FakeAudioContext());
		clock.stepFrame();
		expect(clock.isPlaying).toBe(false);
		expect(clock.audioTime).toBeCloseTo(FRAME_STEP_SEC, 6);
		clock.stepFrame();
		expect(clock.audioTime).toBeCloseTo(FRAME_STEP_SEC * 2, 6);
	});
});

describe("TimelineClock offset semantics", () => {
	it("positive offset makes the visual lane lag the audio lane", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(2);
		clock.setOffsetMs(250);
		expect(clock.visualTime).toBeCloseTo(1.75, 6);
		expect(clock.audioTime).toBeCloseTo(2, 6);
	});

	it("negative offset makes the visual lane lead the audio lane", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(2);
		clock.setOffsetMs(-120);
		expect(clock.visualTime).toBeCloseTo(2.12, 6);
	});

	it("clamps the offset to plus/minus 250 ms", () => {
		const clock = new TimelineClock(new FakeAudioContext());
		clock.setOffsetMs(9999);
		expect(clock.offsetMs).toBe(MAX_OFFSET_MS);
		clock.setOffsetMs(-9999);
		expect(clock.offsetMs).toBe(-MAX_OFFSET_MS);
	});

	it("keeps the audio playhead still when the offset changes", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(3);
		clock.setOffsetMs(100);
		clock.setOffsetMs(-100);
		expect(clock.audioTime).toBeCloseTo(3, 6);
	});

	it("flash-minus-beat difference equals the configured offset", () => {
		const ctx = new FakeAudioContext();
		const clock = new TimelineClock(ctx);
		clock.play();
		ctx.advance(4.3);
		clock.setOffsetMs(150);
		const flashTime =
			Math.floor(clock.visualTime / BEAT_INTERVAL_SEC) * BEAT_INTERVAL_SEC;
		const pairedBeat = flashTime + clock.offsetMs / 1000;
		// the audible beat lands 150 ms before the flash it belongs to
		expect((pairedBeat - flashTime) * 1000).toBeCloseTo(150, 6);
	});
});

describe("TimelineClock beat enumeration", () => {
	it("lists the beats inside a half-open window", () => {
		const clock = new TimelineClock(new FakeAudioContext());
		expect(clock.beatsBetween(0, 1)).toEqual([0, 1]);
		expect(clock.beatsBetween(0.5, 2)).toEqual([1, 2, 3]);
	});

	it("never reports negative beat indices", () => {
		const clock = new TimelineClock(new FakeAudioContext());
		expect(clock.beatsBetween(-1, 0.5)).toEqual([0]);
	});
});
