/**
 * melonJS — pseudo-colour terrain: draggable RGB tone curve cards.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

import {
	type Channel,
	type CurvePoints,
	channelColor,
	type EditorState,
	histogram,
	makeCurveLut,
} from "./process";
import type { Terrain } from "./terrain";

const CHANNEL_INDEX = { R: 0, G: 1, B: 2 } as const;
const POINT_X = [0.25, 0.5, 0.75];

export class CurveCard {
	readonly element: HTMLElement;

	private readonly channel: Channel;
	private readonly canvas = document.createElement("canvas");
	private readonly values = document.createElement("span");
	private readonly bandName = document.createElement("span");
	private readonly observer: ResizeObserver;
	private readonly onChange: (channel: Channel, points: CurvePoints) => void;
	private terrain: Terrain | null = null;
	private state: EditorState | null = null;
	private activePoint = -1;
	private points: CurvePoints = [0.25, 0.5, 0.75];

	constructor(
		channel: Channel,
		onChange: (channel: Channel, points: CurvePoints) => void,
		onReset: (channel: Channel) => void,
	) {
		this.channel = channel;
		this.onChange = onChange;
		this.element = document.createElement("div");
		this.element.className = "tcl-curve-card";
		this.element.dataset.channel = channel;

		const head = document.createElement("div");
		head.className = "tcl-curve-head";
		const dot = document.createElement("span");
		dot.className = "dot";
		dot.style.background = channelColor(channel);
		const letter = document.createElement("strong");
		letter.textContent = channel;
		letter.style.color = channelColor(channel);
		this.bandName.className = "tcl-curve-band";
		this.values.className = "tcl-curve-values";
		const reset = document.createElement("button");
		reset.className = "tcl-curve-reset";
		reset.type = "button";
		reset.textContent = "RESET";
		reset.addEventListener("click", () => onReset(channel));
		head.append(dot, letter, this.bandName, this.values, reset);

		const foot = document.createElement("div");
		foot.className = "tcl-curve-foot";
		const shadowLabel = document.createElement("span");
		shadowLabel.textContent = "SHADOW";
		const highlightLabel = document.createElement("span");
		highlightLabel.textContent = "HIGHLIGHT";
		foot.append(shadowLabel, highlightLabel);

		this.canvas.className = "tcl-curve-canvas";
		this.element.append(head, this.canvas, foot);
		this.observer = new ResizeObserver(() => this.draw());
		this.observer.observe(this.canvas);
		this.bindPointer();
	}

	update(terrain: Terrain, state: EditorState): void {
		this.terrain = terrain;
		this.state = state;
		this.points = [...state.curves[this.channel]] as CurvePoints;
		const bandIndex = state.assignments[CHANNEL_INDEX[this.channel]];
		const band = terrain.bands[bandIndex];
		this.bandName.textContent = `${band.name.toUpperCase()}  /  BAND 0${band.index}`;
		this.values.textContent = this.points
			.map((value) => value.toFixed(2))
			.join("  ");
		this.draw();
	}

	private draw(): void {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		if (width <= 0 || height <= 0) return;
		const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
		this.canvas.width = Math.round(width * dpr);
		this.canvas.height = Math.round(height * dpr);
		const context = this.canvas.getContext("2d");
		if (!context) return;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, width, height);
		context.fillStyle = "#0a1014";
		context.fillRect(0, 0, width, height);
		if (!this.terrain || !this.state) return;

		const padX = 13;
		const padY = 9;
		const graphW = width - padX * 2;
		const graphH = height - padY * 2;
		const color = channelColor(this.channel);
		context.strokeStyle = "rgba(255,255,255,0.055)";
		context.lineWidth = 1;
		for (let i = 1; i < 4; i++) {
			const y = padY + (graphH * i) / 4;
			context.beginPath();
			context.moveTo(padX, y);
			context.lineTo(padX + graphW, y);
			context.stroke();
		}
		context.strokeStyle = "rgba(255,255,255,0.055)";
		for (let i = 1; i < 4; i++) {
			const x = padX + (graphW * i) / 4;
			context.beginPath();
			context.moveTo(x, padY);
			context.lineTo(x, padY + graphH);
			context.stroke();
		}

		const band =
			this.terrain.bands[this.state.assignments[CHANNEL_INDEX[this.channel]]];
		const { counts, peak } = histogram(band, 64);
		for (let i = 0; i < counts.length; i++) {
			const level = Math.sqrt(counts[i] / peak);
			const x = padX + (i / counts.length) * graphW;
			const barW = graphW / counts.length + 0.5;
			const barH = level * graphH;
			context.fillStyle = `${color}${Math.round(80 + level * 95)
				.toString(16)
				.padStart(2, "0")}`;
			context.fillRect(x, padY + graphH - barH, barW, barH);
		}

		const lut = makeCurveLut(this.points);
		context.strokeStyle = "#eff7fa";
		context.lineWidth = 1.6;
		context.beginPath();
		for (let step = 0; step < 256; step++) {
			const x = padX + (step / 255) * graphW;
			const y = padY + graphH - (lut[step] / 255) * graphH;
			if (step === 0) context.moveTo(x, y);
			else context.lineTo(x, y);
		}
		context.stroke();

		for (let index = 0; index < this.points.length; index++) {
			const x = padX + POINT_X[index] * graphW;
			const y = padY + graphH - this.points[index] * graphH;
			context.beginPath();
			context.arc(x, y, 5, 0, Math.PI * 2);
			context.fillStyle =
				index === this.activePoint ? color : "rgba(10,16,20,0.9)";
			context.fill();
			context.strokeStyle = index === this.activePoint ? "#ffffff" : color;
			context.lineWidth = 1.3;
			context.stroke();
		}
	}

	private bindPointer(): void {
		const pointerPoint = (event: PointerEvent) => {
			const rect = this.canvas.getBoundingClientRect();
			const padX = 13;
			const padY = 9;
			const graphW = Math.max(1, rect.width - padX * 2);
			const graphH = Math.max(1, rect.height - padY * 2);
			const x = (event.clientX - rect.left - padX) / graphW;
			let nearest = 0;
			for (let index = 1; index < 3; index++) {
				if (Math.abs(POINT_X[index] - x) < Math.abs(POINT_X[nearest] - x)) {
					nearest = index;
				}
			}
			const y = Math.min(
				1,
				Math.max(0, 1 - (event.clientY - rect.top - padY) / graphH),
			);
			return { nearest, y };
		};

		this.canvas.addEventListener("pointerdown", (event) => {
			event.preventDefault();
			const point = pointerPoint(event);
			this.activePoint = point.nearest;
			this.points[point.nearest] = point.y;
			this.canvas.setPointerCapture(event.pointerId);
			this.onChange(this.channel, [...this.points] as CurvePoints);
			this.draw();
		});
		this.canvas.addEventListener("pointermove", (event) => {
			if (this.activePoint < 0) return;
			const point = pointerPoint(event);
			this.points[this.activePoint] = point.y;
			this.onChange(this.channel, [...this.points] as CurvePoints);
			this.draw();
		});
		const release = (event: PointerEvent) => {
			if (this.activePoint < 0) return;
			this.activePoint = -1;
			try {
				this.canvas.releasePointerCapture(event.pointerId);
			} catch {
				// The pointer may have been cancelled by the browser.
			}
			this.draw();
		};
		this.canvas.addEventListener("pointerup", release);
		this.canvas.addEventListener("pointercancel", release);
	}

	destroy(): void {
		this.observer.disconnect();
	}
}
