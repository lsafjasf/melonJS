/**
 * melonJS — A/V sync lab example: canvas renderer for the flash track.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { BEAT_INTERVAL_SEC, DURATION_SEC, MAX_OFFSET_MS } from "./timeline";

/** how long a flash stays bright, in seconds */
const FLASH_DURATION_SEC = 0.12;

/** geometry of the timeline strip, in CSS pixels */
const STRIP_HEIGHT = 46;
const STRIP_MARGIN = 24;

export type SyncMarker = {
	/** visual content time the marker was inserted at, in seconds */
	visualTime: number;
	label: string;
};

export type RenderState = {
	visualTime: number;
	audioTime: number;
	offsetMs: number;
	markers: SyncMarker[];
};

/**
 * Draws the whole visual lane:
 * - a full-screen flash that fires on every beat of the *visual* track;
 * - a 20 s timeline strip with beat ticks, the playhead and sync markers.
 *
 * Everything is derived from `RenderState`, which the controller recomputes
 * from the single `TimelineClock` each animation frame.
 */
export class FlashRenderer {
	private readonly canvas: HTMLCanvasElement;

	private readonly ctx: CanvasRenderingContext2D;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const context = canvas.getContext("2d");
		if (!context) {
			throw new Error("2D canvas context unavailable");
		}
		this.ctx = context;
	}

	/**
	 * Whether the visual track is flashing at `visualTime`, plus the flash's
	 * brightness (1 at the beat, decaying to 0). Pure so the controller can
	 * reuse it for the "last flash" readout.
	 */
	flashEnvelope(visualTime: number): { active: boolean; brightness: number } {
		const phase = visualTime % BEAT_INTERVAL_SEC;
		if (phase >= FLASH_DURATION_SEC) {
			return { active: false, brightness: 0 };
		}
		return { active: true, brightness: 1 - phase / FLASH_DURATION_SEC };
	}

	/** content time of the most recent flash beat at or before `visualTime` */
	lastFlashTime(visualTime: number): number {
		return Math.floor(visualTime / BEAT_INTERVAL_SEC) * BEAT_INTERVAL_SEC;
	}

	render(state: RenderState): void {
		const width = this.canvas.width;
		const height = this.canvas.height;
		const { brightness } = this.flashEnvelope(state.visualTime);

		// background: dark normally, washed out by the flash envelope
		const ctx = this.ctx;
		const base = Math.round(18 + brightness * 200);
		ctx.fillStyle = `rgb(${base}, ${base}, ${Math.min(255, base + 20)})`;
		ctx.fillRect(0, 0, width, height);

		this.drawFlashPanel(state, brightness, width, height);
		this.drawStrip(state, width, height);
	}

	private drawFlashPanel(
		state: RenderState,
		brightness: number,
		width: number,
		height: number,
	): void {
		const ctx = this.ctx;
		const cx = width / 2;
		const cy = height / 2 - 30;
		const radius = Math.min(width, height) * 0.16;

		ctx.beginPath();
		ctx.arc(cx, cy, radius, 0, Math.PI * 2);
		ctx.fillStyle = `rgba(255, 230, 120, ${0.25 + brightness * 0.75})`;
		ctx.fill();

		ctx.fillStyle = "#f4f4f4";
		ctx.font = "600 22px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("FLASH TRACK", cx, cy - radius - 26);

		ctx.font = "15px sans-serif";
		ctx.fillStyle = "#cfcfcf";
		const direction =
			state.offsetMs === 0
				? "in sync"
				: state.offsetMs > 0
					? `video ${Math.round(state.offsetMs)} ms late`
					: `video ${Math.round(-state.offsetMs)} ms early`;
		ctx.fillText(direction, cx, cy + radius + 30);
	}

	private drawStrip(state: RenderState, width: number, height: number): void {
		const { ctx } = this;
		const top = height - STRIP_HEIGHT - STRIP_MARGIN;
		const left = STRIP_MARGIN;
		const stripWidth = width - STRIP_MARGIN * 2;

		ctx.fillStyle = "#141820";
		ctx.fillRect(left, top, stripWidth, STRIP_HEIGHT);
		ctx.strokeStyle = "#3a4356";
		ctx.lineWidth = 1;
		ctx.strokeRect(left + 0.5, top + 0.5, stripWidth - 1, STRIP_HEIGHT - 1);

		const xForTime = (time: number): number =>
			left + (time / DURATION_SEC) * stripWidth;

		// beat ticks, one per 500 ms; bar ticks every four beats
		const tickCount = Math.round(DURATION_SEC / BEAT_INTERVAL_SEC);
		for (let index = 0; index <= tickCount; index++) {
			const x = xForTime(index * BEAT_INTERVAL_SEC);
			const isBar = index % 4 === 0;
			ctx.beginPath();
			ctx.moveTo(x, top + STRIP_HEIGHT);
			ctx.lineTo(x, top + STRIP_HEIGHT - (isBar ? 14 : 8));
			ctx.strokeStyle = isBar ? "#8de48d" : "#46506a";
			ctx.stroke();
		}

		// sync markers, pinned to visual content time so they travel with
		// the playhead/offset rather than the screen pixel grid
		for (const marker of state.markers) {
			const x = xForTime(marker.visualTime);
			ctx.fillStyle = "#ff8a5c";
			ctx.beginPath();
			ctx.moveTo(x, top);
			ctx.lineTo(x - 6, top - 10);
			ctx.lineTo(x + 6, top - 10);
			ctx.closePath();
			ctx.fill();
			ctx.font = "11px sans-serif";
			ctx.textAlign = "center";
			ctx.fillText(marker.label, x, top - 14);
		}

		// playhead
		const playheadX = xForTime(
			((state.visualTime % DURATION_SEC) + DURATION_SEC) % DURATION_SEC,
		);
		ctx.beginPath();
		ctx.moveTo(playheadX, top - 4);
		ctx.lineTo(playheadX, top + STRIP_HEIGHT + 4);
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.lineWidth = 1;

		// offset guide: where the audio beat sits relative to the playhead
		const guideTime = state.visualTime + state.offsetMs / 1000;
		if (guideTime >= 0 && guideTime <= DURATION_SEC) {
			const guideX = xForTime(guideTime);
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(guideX, top);
			ctx.lineTo(guideX, top + STRIP_HEIGHT);
			ctx.strokeStyle =
				Math.abs(state.offsetMs) > MAX_OFFSET_MS ? "#ff5c5c" : "#5cb8ff";
			ctx.stroke();
			ctx.setLineDash([]);
		}
	}
}
