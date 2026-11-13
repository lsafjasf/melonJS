/**
 * melonJS — A/V sync lab example: media timeline clock.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

/** total length of the generated program, in seconds */
export const DURATION_SEC = 20;

/** one beat every 500 ms, so the 20 s program holds 40 beats */
export const BEAT_INTERVAL_SEC = 0.5;

/** one frame step, in seconds (60 fps) */
export const FRAME_STEP_SEC = 1 / 60;

/** largest artificial delay the user can dial in, in milliseconds */
export const MAX_OFFSET_MS = 250;

/**
 * The only clock surface the timeline needs. A real `AudioContext`
 * satisfies this structurally; tests can pass a hand-rolled fake.
 */
export type AudioClock = Pick<BaseAudioContext, "currentTime">;

/**
 * Single source of truth for playback position.
 *
 * The AudioContext clock (`ctx.currentTime`) is the master clock: both the
 * audio scheduler and the canvas render read positions from it, so the two
 * can never drift apart on their own. The only divergence is the one the
 * user deliberately introduces through `offsetMs`.
 *
 * Sign convention for `offsetMs` (the current A/V deviation):
 * - positive: video is shown LATE, the audible beat leads the flash;
 * - negative: video is shown EARLY, the flash leads the audible beat;
 * - zero: the flash and its beat land on the same wall-clock instant.
 *
 * Internally `offsetSec` shifts the visual content time relative to the
 * audio master time.
 */
export class TimelineClock {
	private ctx: AudioClock;

	private originCtxTime = 0;

	private positionAtOrigin = 0;

	private playing = false;

	private offsetSec = 0;

	constructor(ctx: AudioClock) {
		this.ctx = ctx;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	/** current audio-track (master) content time, in seconds */
	get audioTime(): number {
		if (!this.playing) {
			return this.positionAtOrigin;
		}
		return this.positionAtOrigin + (this.ctx.currentTime - this.originCtxTime);
	}

	/** content time the canvas should paint right now, in seconds */
	get visualTime(): number {
		return this.audioTime - this.offsetSec;
	}

	/** the configured A/V deviation, in milliseconds */
	get offsetMs(): number {
		return this.offsetSec * 1000;
	}

	setOffsetMs(ms: number): void {
		this.applyOffsetMs(ms);
		// Keep the audio position fixed while the visual lane slides, so
		// turning the knob never moves the playhead on the audio track.
		this.seek(this.audioTime);
	}

	/**
	 * Set the deviation alone, leaving every transport anchor untouched.
	 * Needed while a recording is already capturing the clock.
	 */
	applyOffsetMs(ms: number): void {
		const clamped = Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, ms));
		this.offsetSec = clamped / 1000;
	}

	/**
	 * Move the playhead to an audio-track time. Wraps around the program so
	 * dragging past either end stays inside the 20 s window.
	 */
	seek(audioTrackTime: number): void {
		const wrapped =
			((audioTrackTime % DURATION_SEC) + DURATION_SEC) % DURATION_SEC;
		this.positionAtOrigin = wrapped;
		this.originCtxTime = this.ctx.currentTime;
	}

	play(): void {
		if (this.playing) {
			return;
		}
		this.playing = true;
		this.originCtxTime = this.ctx.currentTime;
	}

	pause(): void {
		if (!this.playing) {
			return;
		}
		this.positionAtOrigin = this.audioTime;
		this.playing = false;
	}

	/** Advance one frame while paused. */
	stepFrame(): void {
		this.pause();
		this.seek(this.positionAtOrigin + FRAME_STEP_SEC);
	}

	/** beat indices whose content time falls within `[from, to)` */
	beatsBetween(from: number, to: number): number[] {
		const first = Math.ceil(from / BEAT_INTERVAL_SEC - 1e-9);
		const last = Math.ceil(to / BEAT_INTERVAL_SEC - 1e-9) - 1;
		const indices: number[] = [];
		for (let index = Math.max(0, first); index <= last; index++) {
			indices.push(index);
		}
		return indices;
	}

	/** content time of a beat, in seconds */
	beatTime(index: number): number {
		return index * BEAT_INTERVAL_SEC;
	}
}
