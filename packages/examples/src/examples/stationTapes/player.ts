/**
 * melonJS — Station Tapes example: buffer playback through the engine mixer.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { audio } from "melonjs";
import type { ClipInfo } from "./case";

/**
 * Plays the synthesised clips as raw AudioBuffers. The sources connect to
 * the engine's master gain, so `audio.setVolume` / `muteAll` and the
 * focus-loss mute keep working. Position is tracked on the audio clock so
 * the playhead stays honest across pause/resume.
 */
export class ClipPlayer {
	private source: AudioBufferSourceNode | null = null;
	private startedAt = 0;
	private offset = 0;
	/** the clip currently loaded (playing or paused), if any */
	clip: ClipInfo | null = null;
	playing = false;
	/** fired when a clip plays out to the end on its own */
	onended: (() => void) | null = null;

	private startSource(offset: number): void {
		const ctx = audio.getAudioContext();
		const master = audio.getMasterGain();
		if (ctx === null || master === null || this.clip === null) {
			return;
		}
		const source = ctx.createBufferSource();
		source.buffer = this.clip.buffer;
		source.connect(master);
		this.source = source;
		this.offset = offset;
		this.startedAt = ctx.currentTime;
		this.playing = true;
		source.onended = () => {
			if (this.source === source) {
				this.source = null;
				this.playing = false;
				this.offset = 0;
				this.onended?.();
			}
		};
		source.start(0, offset);
	}

	private stopSource(): void {
		if (this.source !== null) {
			const source = this.source;
			this.source = null;
			source.onended = null;
			source.stop();
			source.disconnect();
		}
		this.playing = false;
	}

	/** play a clip from `offset` seconds, replacing whatever is playing */
	play(clip: ClipInfo, offset = 0): void {
		this.stopSource();
		this.clip = clip;
		this.startSource(offset);
	}

	/** freeze playback, keeping the position for {@link resume} */
	pause(): void {
		if (!this.playing) {
			return;
		}
		this.offset = this.position();
		this.stopSource();
	}

	/** continue a paused clip from where it froze */
	resume(): void {
		if (this.playing || this.clip === null) {
			return;
		}
		this.startSource(this.offset);
	}

	/** stop and unload */
	stop(): void {
		this.stopSource();
		this.clip = null;
		this.offset = 0;
	}

	/** seconds into the current clip, or -1 when nothing is loaded */
	position(): number {
		if (this.clip === null) {
			return -1;
		}
		if (!this.playing) {
			return this.offset;
		}
		const ctx = audio.getAudioContext();
		if (ctx === null) {
			return this.offset;
		}
		return Math.min(this.offset + ctx.currentTime - this.startedAt, this.clip.buffer.duration);
	}
}
