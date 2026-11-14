/**
 * melonJS — subtitle editor: the single time base.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Everything on screen — the video frame, the playhead, the active cue and
 * the waveform cursor — reads `Transport.time`. The HTML5 video element is
 * only a frame/audio source: its own clock is continuously reconciled to
 * this one, so nothing can run "faster on one side". The bundled clip is
 * 10 s while the demo timeline is 40 s, so the source is looped through
 * `time % sourceDuration`; that mapping lives here, in one place.
 */
import { TIMELINE_DURATION } from "./cues";

export interface TransportEvents {
	/** emitted on every frame while mounted, with the current timeline time */
	seek?(time: number): void;
	/** the play/pause state changed */
	playState?(playing: boolean): void;
}

/** tolerance before the video element is hard-resynced, in seconds */
const SYNC_TOLERANCE = 0.08;

export class Transport {
	/** the one authoritative time, in seconds on the 40 s timeline */
	private current = 0;

	private playing = false;

	/** wall-clock timestamp of the last frame, used to advance time */
	private lastWallMs: number | null = null;

	private rafId: number | null = null;

	private readonly events: TransportEvents;

	private readonly video: HTMLVideoElement;

	constructor(video: HTMLVideoElement, events: TransportEvents = {}) {
		this.video = video;
		this.events = events;
	}

	get time(): number {
		return this.current;
	}

	get isPlaying(): boolean {
		return this.playing;
	}

	/** length of the source clip; falls back to the full timeline until metadata loads */
	get sourceDuration(): number {
		return Number.isFinite(this.video.duration) && this.video.duration > 0
			? this.video.duration
			: TIMELINE_DURATION;
	}

	/** replace the frame/play-state callbacks (the React panels mount after boot) */
	setEvents(events: TransportEvents): void {
		this.events = events;
	}

	/** map a timeline time onto the looping source clip */
	private sourceTime(time: number): number {
		return time % this.sourceDuration;
	}

	/**
	 * Point both clocks at `time`. The video is positioned immediately so a
	 * paused scrub still shows the matching frame — this is what keeps the
	 * picture and the playhead on the same time base.
	 */
	seekTo(time: number): void {
		this.current = Math.min(TIMELINE_DURATION, Math.max(0, time));
		this.syncVideo(true);
		this.events.seek?.(this.current);
	}

	play(): void {
		if (this.playing) {
			return;
		}
		// restart from the top once the end of the 40 s timeline is reached
		if (this.current >= TIMELINE_DURATION - 0.001) {
			this.current = 0;
		}
		this.playing = true;
		this.lastWallMs = null;
		void this.video.play().catch(() => {
			// autoplay policies can reject the first play() until a user
			// gesture; the button press that called play() counts, but stay
			// safe and drop back to paused rather than throwing.
			this.playing = false;
			this.events.playState?.(false);
		});
		this.events.playState?.(true);
		this.tick();
	}

	pause(): void {
		if (!this.playing) {
			return;
		}
		this.playing = false;
		this.video.pause();
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
		this.lastWallMs = null;
		this.events.playState?.(false);
	}

	toggle(): void {
		if (this.playing) {
			this.pause();
		} else {
			this.play();
		}
	}

	/**
	 * Loop the [start, end) range: seek to its in point and arm the boundary.
	 * Passing a null range returns to normal end-of-timeline behaviour.
	 */
	setLoopRange(range: { start: number; end: number } | null): void {
		this.loopRange = range;
		if (range && (this.current < range.start || this.current >= range.end)) {
			this.seekTo(range.start);
		}
	}

	private loopRange: { start: number; end: number } | null = null;

	private tick = (): void => {
		if (!this.playing) {
			return;
		}
		const now = performance.now();
		if (this.lastWallMs !== null) {
			this.current += (now - this.lastWallMs) / 1000;

			if (this.loopRange && this.current >= this.loopRange.end) {
				this.current = this.loopRange.start;
				this.syncVideo(true);
			} else if (this.current >= TIMELINE_DURATION) {
				this.current = TIMELINE_DURATION;
				this.pause();
				this.events.seek?.(this.current);
				return;
			} else {
				this.syncVideo(false);
			}
			this.events.seek?.(this.current);
		}
		this.lastWallMs = now;
		this.rafId = requestAnimationFrame(this.tick);
	};

	/**
	 * Reconcile the video element to the authoritative time. The clip is
	 * shorter than the timeline and loops, so the expected element position
	 * is `time % sourceDuration`. When the drift exceeds the tolerance (a
	 * loop wrap, a seek, or the browser stalling) we set currentTime; within
	 * tolerance the element keeps its own smooth playback.
	 */
	private syncVideo(force: boolean): void {
		if (!Number.isFinite(this.video.duration) || this.video.duration === 0) {
			return;
		}
		const expected = this.sourceTime(this.current);
		const drift = Math.abs(this.video.currentTime - expected);
		if (force || drift > SYNC_TOLERANCE) {
			this.video.currentTime = expected;
		}
	}

	/** stop the rAF loop and release the video element */
	destroy(): void {
		this.pause();
		this.video.removeAttribute("src");
		this.video.load();
	}
}
