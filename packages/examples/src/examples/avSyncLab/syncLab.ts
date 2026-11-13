/**
 * melonJS — A/V sync lab example: controller wiring clock, audio, canvas.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { BeatAudioEngine } from "./audioEngine";
import {
	measurePreview,
	type RecordedPreview,
	recordPreview,
} from "./recorder";
import { FlashRenderer, type SyncMarker } from "./renderer";
import { BEAT_INTERVAL_SEC, MAX_OFFSET_MS, TimelineClock } from "./timeline";

const STORAGE_KEY = "melonjs-av-sync-lab:v1";

export type SyncLabSnapshot = {
	playing: boolean;
	offsetMs: number;
	audioTime: number;
	visualTime: number;
	lastFlashTime: number;
	lastBeatTime: number;
	markers: SyncMarker[];
};

type StoredPrefs = {
	offsetMs?: number;
	markers?: SyncMarker[];
};

export type PreviewKind = "biased" | "corrected";

/**
 * Framework-agnostic controller. The React component only renders HUD text
 * and buttons; every media decision lives here so the timing logic can be
 * unit-tested without React.
 */
export class SyncLab {
	private readonly clock: TimelineClock;

	private readonly audio: BeatAudioEngine;

	private readonly renderer: FlashRenderer;

	private markers: SyncMarker[] = [];

	private rafId = 0;

	private markerCounter = 0;

	private previewUrls: string[] = [];

	private readonly onSnapshot: (snapshot: SyncLabSnapshot) => void;

	constructor(
		canvas: HTMLCanvasElement,
		onSnapshot: (snapshot: SyncLabSnapshot) => void,
	) {
		const ctx = new AudioContext();
		this.clock = new TimelineClock(ctx);
		this.audio = new BeatAudioEngine(ctx, this.clock);
		this.renderer = new FlashRenderer(canvas);
		this.onSnapshot = onSnapshot;
		this.loadPrefs();
	}

	get offsetMs(): number {
		return this.clock.offsetMs;
	}

	get isPlaying(): boolean {
		return this.clock.isPlaying;
	}

	/** current audio-track (master) position, in seconds */
	get audioTime(): number {
		return this.clock.audioTime;
	}

	/** begin the rAF render loop (called once on mount) */
	startLoop(): void {
		const frame = () => {
			this.paint();
			this.rafId = globalThis.requestAnimationFrame(frame);
		};
		this.rafId = globalThis.requestAnimationFrame(frame);
	}

	async play(): Promise<void> {
		await this.audio.start();
		await this.audio.resumeContext();
		this.audio.resetScheduler();
		this.clock.play();
		this.paint();
	}

	async pause(): Promise<void> {
		this.clock.pause();
		await this.audio.suspend();
		this.paint();
	}

	async stepFrame(): Promise<void> {
		const wasPlaying = this.clock.isPlaying;
		this.clock.stepFrame();
		if (wasPlaying) {
			await this.audio.suspend();
		}
		// a single click for the beat under the new playhead, if it sits on one
		const beatIndex = Math.round(this.clock.audioTime / BEAT_INTERVAL_SEC);
		if (
			Math.abs(this.clock.audioTime - beatIndex * BEAT_INTERVAL_SEC) <
			1 / 60
		) {
			await this.audio.resumeContext();
			this.audio.playClick(beatIndex);
		}
		this.paint();
	}

	seekTo(timeSec: number): void {
		this.clock.seek(timeSec);
		this.audio.resetScheduler();
		this.paint();
	}

	setOffsetMs(ms: number): void {
		this.clock.setOffsetMs(ms);
		this.audio.resetScheduler();
		this.savePrefs();
		this.paint();
	}

	/**
	 * Change the deviation WITHOUT re-anchoring the playhead or touching the
	 * audio scheduler. Used mid-recording, where a seek would silently move
	 * the clock the running `MediaRecorder` is capturing.
	 */
	private setOffsetForRecording(ms: number): void {
		this.clock.applyOffsetMs(ms);
		this.paint();
	}

	addMarker(): void {
		this.markerCounter += 1;
		this.markers.push({
			visualTime: this.clock.visualTime,
			label: `M${this.markerCounter}`,
		});
		this.savePrefs();
		this.paint();
	}

	clearMarkers(): void {
		this.markers = [];
		this.savePrefs();
		this.paint();
	}

	/** persist the current deviation (and markers) and confirm the write */
	saveOffset(): void {
		this.savePrefs();
	}

	/**
	 * Record one preview. `kind` decides whether the current artificial
	 * deviation is kept ("biased") or temporarily zeroed ("corrected"), then
	 * the previous offset is restored.
	 */
	async recordPreview(
		canvas: HTMLCanvasElement,
		kind: PreviewKind,
		durationSec = 4,
	): Promise<RecordedPreview> {
		const previousOffset = this.clock.offsetMs;
		if (kind === "corrected") {
			this.setOffsetForRecording(0);
		}
		const wasPlaying = this.clock.isPlaying;
		if (!wasPlaying) {
			await this.play();
		}
		// Start slightly BEFORE the next beat, so the first flash and its
		// click both happen inside the clip (not at t=0) and the measurement
		// sees a clean dark baseline before the attack.
		await this.waitForPreRoll();
		const { blob, mimeType } = await recordPreview(
			canvas,
			this.audio.mediaStream,
			durationSec,
		);
		if (!wasPlaying) {
			await this.pause();
		}
		if (kind === "corrected") {
			this.setOffsetForRecording(previousOffset);
		}
		const measurement = await measurePreview(blob);
		const url = URL.createObjectURL(blob);
		this.previewUrls.push(url);
		return {
			blob,
			url,
			mimeType,
			measurement,
		};
	}

	dispose(): void {
		globalThis.cancelAnimationFrame(this.rafId);
		for (const url of this.previewUrls) {
			URL.revokeObjectURL(url);
		}
		this.previewUrls.length = 0;
		void this.audio.dispose();
	}

	/** resolve one pre-roll window before the next beat boundary */
	private waitForPreRoll(): Promise<void> {
		const preRoll = 0.2;
		const target =
			(Math.floor(this.clock.audioTime / BEAT_INTERVAL_SEC) + 1) *
				BEAT_INTERVAL_SEC -
			preRoll;
		return new Promise((resolve) => {
			const check = () => {
				if (this.clock.audioTime >= target) {
					resolve();
					return;
				}
				globalThis.setTimeout(check, 5);
			};
			check();
		});
	}

	private paint(): void {
		const visualTime = this.clock.visualTime;
		this.renderer.render({
			visualTime,
			audioTime: this.clock.audioTime,
			offsetMs: this.clock.offsetMs,
			markers: this.markers,
		});
		const lastFlashTime = this.renderer.lastFlashTime(visualTime);
		this.onSnapshot({
			playing: this.clock.isPlaying,
			offsetMs: this.clock.offsetMs,
			audioTime: this.clock.audioTime,
			visualTime,
			lastFlashTime,
			// the beat paired with that flash, on the audio master track
			lastBeatTime: lastFlashTime + this.clock.offsetMs / 1000,
			markers: [...this.markers],
		});
	}

	private loadPrefs(): void {
		try {
			const raw = globalThis.localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return;
			}
			const prefs = JSON.parse(raw) as StoredPrefs;
			if (typeof prefs.offsetMs === "number") {
				// apply, don't `setOffsetMs`: the latter re-anchors the
				// playhead, which is pointless at the paused initial position
				this.clock.applyOffsetMs(
					Math.max(-MAX_OFFSET_MS, Math.min(MAX_OFFSET_MS, prefs.offsetMs)),
				);
			}
			if (Array.isArray(prefs.markers)) {
				this.markers = prefs.markers.filter(
					(marker): marker is SyncMarker =>
						typeof marker?.visualTime === "number" &&
						typeof marker?.label === "string",
				);
				this.markerCounter = this.markers.length;
			}
		} catch {
			// corrupt or unavailable storage — start from defaults
		}
	}

	private savePrefs(): void {
		try {
			const prefs: StoredPrefs = {
				offsetMs: this.clock.offsetMs,
				markers: this.markers,
			};
			globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
		} catch {
			// storage disabled (private mode, quota) — nothing to persist
		}
	}
}
