/**
 * melonJS — A/V sync lab example: Web Audio beat synthesis + scheduler.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	BEAT_INTERVAL_SEC,
	DURATION_SEC,
	type TimelineClock,
} from "./timeline";

/** scheduler look-ahead: how far ahead beats get queued, in seconds */
const SCHEDULE_AHEAD_SEC = 0.12;

/** how often the scheduler timer wakes, in milliseconds */
const TIMER_INTERVAL_MS = 25;

/** scheduled notes that still have to be cancelled on seek/pause */
type ScheduledNote = {
	osc: OscillatorNode;
	gain: GainNode;
	stopAt: number;
};

/**
 * Synthesizes the metronome track from pure Web Audio nodes — no samples —
 * and schedules it ahead of the `TimelineClock` using the standard
 * look-ahead timer pattern.
 *
 * The graph is `oscillator -> gain -> master -> [destination, tap]`. The
 * extra `tap` node is the `MediaStreamAudioDestinationNode` the recorder
 * captures, so a preview records exactly what the user hears.
 */
export class BeatAudioEngine {
	readonly ctx: AudioContext;

	private readonly clock: TimelineClock;

	private readonly master: GainNode;

	private readonly tap: MediaStreamAudioDestinationNode;

	private timer: ReturnType<typeof setInterval> | null = null;

	private notes: ScheduledNote[] = [];

	/** next beat content-time to consider, in seconds */
	private nextBeatTime = 0;

	constructor(ctx: AudioContext, clock: TimelineClock) {
		this.ctx = ctx;
		this.clock = clock;
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.6;
		this.master.connect(this.ctx.destination);
		this.tap = this.ctx.createMediaStreamDestination();
		this.master.connect(this.tap);
	}

	/** audio stream for `MediaRecorder`, carrying the beat track only */
	get mediaStream(): MediaStream {
		return this.tap.stream;
	}

	/** resume the context after a user gesture and start the scheduler */
	async start(): Promise<void> {
		if (this.ctx.state === "suspended") {
			await this.ctx.resume();
		}
		if (this.timer === null) {
			this.timer = globalThis.setInterval(
				() => this.schedule(),
				TIMER_INTERVAL_MS,
			);
		}
	}

	/**
	 * Drop every queued note and re-arm from the clock's current position.
	 * Called on play, seek, frame step and offset change: anything scheduled
	 * against the old timeline position would otherwise play at the wrong
	 * wall-clock instant (or twice).
	 */
	resetScheduler(): void {
		for (const note of this.notes) {
			try {
				note.osc.stop(note.stopAt);
				note.osc.disconnect();
				note.gain.disconnect();
			} catch {
				// already stopped — nothing to clean up
			}
		}
		this.notes = [];
		this.nextBeatTime = this.clock.audioTime;
	}

	/**
	 * Play one beat immediately (used by frame stepping while the transport
	 * is paused, so stepping is still audible).
	 */
	playClick(beatIndex: number): void {
		const when = this.ctx.currentTime + 0.01;
		this.scheduleNote(beatIndex, when);
	}

	/** suspend the context, freezing its clock while paused */
	async suspend(): Promise<void> {
		this.resetScheduler();
		await settle(this.ctx.state === "running" ? this.ctx.suspend() : null);
	}

	async resumeContext(): Promise<void> {
		await settle(this.ctx.state === "suspended" ? this.ctx.resume() : null);
	}

	async dispose(): Promise<void> {
		if (this.timer !== null) {
			globalThis.clearInterval(this.timer);
			this.timer = null;
		}
		this.resetScheduler();
		await settle(this.ctx.close());
	}

	private schedule(): void {
		if (!this.clock.isPlaying || this.ctx.state !== "running") {
			return;
		}
		const horizon = this.clock.audioTime + SCHEDULE_AHEAD_SEC;
		// `nextBeatTime` runs monotonically across loops; the clock wraps its
		// own position, and beat content time is taken modulo the duration.
		while (this.nextBeatTime < horizon) {
			const beatIndex = Math.round(this.nextBeatTime / BEAT_INTERVAL_SEC);
			const contentBeat =
				beatIndex % Math.round(DURATION_SEC / BEAT_INTERVAL_SEC);
			const wallTime =
				this.ctx.currentTime + (this.nextBeatTime - this.clock.audioTime);
			this.scheduleNote(contentBeat, wallTime);
			this.nextBeatTime += BEAT_INTERVAL_SEC;
		}
	}

	private scheduleNote(beatIndex: number, when: number): void {
		const osc = this.ctx.createOscillator();
		const gain = this.ctx.createGain();
		// downbeat of each 4-beat bar gets the higher pitch
		osc.frequency.value = beatIndex % 4 === 0 ? 1320 : 880;
		osc.type = "square";
		const duration = 0.06;
		gain.gain.setValueAtTime(0.0001, when);
		gain.gain.exponentialRampToValueAtTime(0.9, when + 0.005);
		gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
		osc.connect(gain);
		gain.connect(this.master);
		osc.start(when);
		const stopAt = when + duration + 0.02;
		osc.stop(stopAt);
		this.notes.push({ osc, gain, stopAt });
		// forget finished notes so the cancellation list cannot grow forever
		globalThis.setTimeout(
			() => {
				this.notes = this.notes.filter((note) => note.osc !== osc);
			},
			(stopAt - this.ctx.currentTime) * 1000 + 50,
		);
	}
}

/**
 * Guard AudioContext state transitions: a context that never received a
 * user gesture (headless tests, some autoplay policies) can leave
 * `suspend()`/`resume()` pending indefinitely. The transport must not hang
 * waiting on a promise the browser has no intention of settling.
 */
const settle = async (operation: Promise<void> | null): Promise<void> => {
	if (operation === null) {
		return;
	}
	await Promise.race([
		operation.catch(() => {}),
		new Promise<void>((resolve) => {
			globalThis.setTimeout(resolve, 1000);
		}),
	]);
};
