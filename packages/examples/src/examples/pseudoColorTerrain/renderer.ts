/**
 * melonJS — pseudo-colour terrain: interactive canvas renderer.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

import {
	channelColor,
	type EditorState,
	histogram,
	type ProcessedImage,
} from "./process";
import type { Terrain } from "./terrain";

export type ViewMode = "composite" | "single" | "original";
export type SamplePoint = { x: number; y: number; band?: number };

export type ViewportCallbacks = {
	onSample: (sample: SamplePoint) => void;
	onZoom: (percent: number) => void;
};

const TILE_GAP = 18;
const VIEW_PADDING = 52;
const BAND_COLORS = ["#5a9bff", "#57dc7a", "#f1bd62", "#ff5b58"];

const makeBandCanvas = (terrain: Terrain, index: number) => {
	const canvas = document.createElement("canvas");
	canvas.width = terrain.size;
	canvas.height = terrain.size;
	const context = canvas.getContext("2d");
	if (!context) {
		return canvas;
	}
	const image = context.createImageData(terrain.size, terrain.size);
	const data = terrain.bands[index].data;
	for (let i = 0; i < data.length; i++) {
		const value = Math.round(data[i] * 255);
		const offset = i * 4;
		image.data[offset] = value;
		image.data[offset + 1] = value;
		image.data[offset + 2] = value;
		image.data[offset + 3] = 255;
	}
	context.putImageData(image, 0, 0);
	return canvas;
};

const makeCompositeCanvas = (image: ProcessedImage) => {
	const canvas = document.createElement("canvas");
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext("2d");
	if (context) {
		context.putImageData(
			new ImageData(image.pixels, image.width, image.height),
			0,
			0,
		);
	}
	return canvas;
};

export class TerrainViewport {
	readonly canvas = document.createElement("canvas");

	private readonly host: HTMLElement;
	private readonly callbacks: ViewportCallbacks;
	private readonly context: CanvasRenderingContext2D;
	private readonly observer: ResizeObserver;
	private bandCanvases: HTMLCanvasElement[] = [];
	private compositeCanvas: HTMLCanvasElement | null = null;
	private terrain: Terrain | null = null;
	private state: EditorState | null = null;
	private mode: ViewMode = "composite";
	private singleBand = 3;
	private zoom = 1;
	private panX = 0;
	private panY = 0;
	private sample: SamplePoint | null = null;
	private cssWidth = 1;
	private cssHeight = 1;
	private pointerId: number | null = null;
	private dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
	private dragged = false;

	constructor(host: HTMLElement, callbacks: ViewportCallbacks) {
		this.host = host;
		this.callbacks = callbacks;
		this.canvas.className = "tcl-view-canvas";
		host.appendChild(this.canvas);
		const context = this.canvas.getContext("2d");
		if (!context) {
			throw new Error("The terrain viewport needs a 2D canvas context");
		}
		this.context = context;
		this.observer = new ResizeObserver(() => this.resize());
		this.observer.observe(host);
		this.bindPointer();
		this.resize();
	}

	setData(terrain: Terrain, image: ProcessedImage, state: EditorState): void {
		this.terrain = terrain;
		this.state = state;
		this.bandCanvases = terrain.bands.map((_, index) =>
			makeBandCanvas(terrain, index),
		);
		this.compositeCanvas = makeCompositeCanvas(image);
		this.render();
	}

	updateImage(image: ProcessedImage, state: EditorState): void {
		this.state = state;
		this.compositeCanvas = makeCompositeCanvas(image);
		this.render();
	}

	setMode(mode: ViewMode, singleBand = this.singleBand): void {
		this.mode = mode;
		this.singleBand = singleBand;
		this.render();
	}

	setSingleBand(index: number): void {
		this.singleBand = index;
		this.render();
	}

	setSample(sample: SamplePoint | null): void {
		this.sample = sample;
		this.render();
	}

	resetView(): void {
		this.zoom = 1;
		this.panX = 0;
		this.panY = 0;
		this.callbacks.onZoom(100);
		this.render();
	}

	zoomBy(factor: number, clientX?: number, clientY?: number): void {
		const previous = this.zoom;
		this.zoom = Math.min(8, Math.max(0.25, this.zoom * factor));
		const rect = this.canvas.getBoundingClientRect();
		const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
		const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
		const dx = x - rect.width / 2;
		const dy = y - rect.height / 2;
		const ratio = this.zoom / previous;
		this.panX = dx - (dx - this.panX) * ratio;
		this.panY = dy - (dy - this.panY) * ratio;
		this.callbacks.onZoom(Math.round(this.zoom * 100));
		this.render();
	}

	destroy(): void {
		this.observer.disconnect();
		this.canvas.remove();
	}

	private resize(): void {
		const rect = this.host.getBoundingClientRect();
		const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
		this.cssWidth = Math.max(1, Math.round(rect.width));
		this.cssHeight = Math.max(1, Math.round(rect.height));
		this.canvas.width = Math.round(this.cssWidth * dpr);
		this.canvas.height = Math.round(this.cssHeight * dpr);
		this.canvas.style.width = `${this.cssWidth}px`;
		this.canvas.style.height = `${this.cssHeight}px`;
		this.render();
	}

	private contentSize(): number {
		if (!this.terrain) {
			return 384;
		}
		return this.mode === "original"
			? this.terrain.size * 2 + TILE_GAP
			: this.terrain.size;
	}

	private fitScale(): number {
		const availableW = Math.max(1, this.cssWidth - VIEW_PADDING * 2);
		const availableH = Math.max(1, this.cssHeight - VIEW_PADDING * 2);
		return Math.min(availableW, availableH) / this.contentSize();
	}

	private contentRect(): { x: number; y: number; size: number; scale: number } {
		const scale = this.fitScale() * this.zoom;
		const size = this.contentSize() * scale;
		return {
			x: this.cssWidth / 2 - size / 2 + this.panX,
			y: this.cssHeight / 2 - size / 2 + this.panY,
			size,
			scale,
		};
	}

	private tileRect(index: number) {
		if (!this.terrain) {
			return null;
		}
		const content = this.contentRect();
		const tile = this.terrain.size * content.scale;
		const gap = TILE_GAP * content.scale;
		const col = index % 2;
		const row = Math.floor(index / 2);
		return {
			x: content.x + col * (tile + gap),
			y: content.y + row * (tile + gap),
			size: tile,
		};
	}

	private drawChecker(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		height: number,
	) {
		context.save();
		context.beginPath();
		context.rect(x, y, width, height);
		context.clip();
		context.fillStyle = "#070b0e";
		context.fillRect(x, y, width, height);
		const cell = 14;
		context.fillStyle = "#0d1318";
		const startX = x - (((x % cell) + cell) % cell);
		const startY = y - (((y % cell) + cell) % cell);
		for (let py = startY; py < y + height; py += cell) {
			for (let px = startX; px < x + width; px += cell) {
				if (
					(Math.floor((px - startX) / cell) +
						Math.floor((py - startY) / cell)) %
						2 ===
					0
				) {
					context.fillRect(px, py, cell, cell);
				}
			}
		}
		context.restore();
	}

	private drawFrame(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		size: number,
		color = "rgba(255,255,255,0.16)",
	) {
		context.strokeStyle = color;
		context.lineWidth = 1;
		context.strokeRect(
			Math.round(x) + 0.5,
			Math.round(y) + 0.5,
			Math.round(size),
			Math.round(size),
		);
	}

	render(): void {
		const context = this.context;
		const dpr = this.canvas.width / this.cssWidth;
		context.setTransform(dpr, 0, 0, dpr, 0, 0);
		context.clearRect(0, 0, this.cssWidth, this.cssHeight);
		const backdrop = context.createRadialGradient(
			this.cssWidth * 0.5,
			this.cssHeight * 0.42,
			0,
			this.cssWidth * 0.5,
			this.cssHeight * 0.42,
			Math.max(this.cssWidth, this.cssHeight) * 0.8,
		);
		backdrop.addColorStop(0, "#11181f");
		backdrop.addColorStop(1, "#070a0d");
		context.fillStyle = backdrop;
		context.fillRect(0, 0, this.cssWidth, this.cssHeight);

		if (!this.terrain || !this.state) {
			context.fillStyle = "#668092";
			context.font = "12px ui-monospace, monospace";
			context.fillText("GENERATING TERRAIN…", 24, 28);
			return;
		}

		if (this.mode === "original") {
			this.terrain.bands.forEach((band, index) => {
				const rect = this.tileRect(index);
				const canvas = this.bandCanvases[index];
				if (!rect || !canvas) return;
				this.drawChecker(context, rect.x, rect.y, rect.size, rect.size);
				context.imageSmoothingEnabled = false;
				context.drawImage(canvas, rect.x, rect.y, rect.size, rect.size);
				this.drawFrame(context, rect.x, rect.y, rect.size);
				context.fillStyle = "rgba(3,7,10,0.82)";
				context.fillRect(rect.x + 10, rect.y + 10, 116, 26);
				context.fillStyle = BAND_COLORS[index];
				context.font = "600 11px ui-monospace, monospace";
				context.fillText(
					`0${index}  ${band.name.toUpperCase()}`,
					rect.x + 19,
					rect.y + 27,
				);
			});
		} else {
			const rect = this.contentRect();
			const canvas =
				this.mode === "composite"
					? this.compositeCanvas
					: this.bandCanvases[this.singleBand];
			if (canvas) {
				if (this.mode === "composite") {
					this.drawChecker(context, rect.x, rect.y, rect.size, rect.size);
				} else {
					context.fillStyle = "#05080a";
					context.fillRect(rect.x, rect.y, rect.size, rect.size);
				}
				context.imageSmoothingEnabled = this.zoom * this.fitScale() < 3;
				context.drawImage(canvas, rect.x, rect.y, rect.size, rect.size);
				this.drawFrame(
					context,
					rect.x,
					rect.y,
					rect.size,
					this.mode === "single"
						? channelColor(
								this.state.assignments[this.singleBand] === undefined
									? "A"
									: (["R", "G", "B", "A"][
											this.state.assignments.indexOf(this.singleBand)
										] as "R" | "G" | "B" | "A"),
							)
						: "rgba(255,255,255,0.2)",
				);
			}
		}

		if (this.sample) {
			this.drawSample(context);
		}
	}

	private drawCrosshair(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
	) {
		context.save();
		context.shadowColor = "rgba(0,0,0,0.9)";
		context.shadowBlur = 4;
		context.strokeStyle = "#ffffff";
		context.lineWidth = 1;
		context.beginPath();
		context.moveTo(x - 13, y);
		context.lineTo(x - 4, y);
		context.moveTo(x + 4, y);
		context.lineTo(x + 13, y);
		context.moveTo(x, y - 13);
		context.lineTo(x, y - 4);
		context.moveTo(x, y + 4);
		context.lineTo(x, y + 13);
		context.stroke();
		context.beginPath();
		context.arc(x, y, 3.2, 0, Math.PI * 2);
		context.fillStyle = "#ffffff";
		context.fill();
		context.restore();
	}

	private drawSample(context: CanvasRenderingContext2D) {
		if (!this.sample || !this.terrain) return;
		if (this.mode === "original") {
			for (let index = 0; index < 4; index++) {
				const tile = this.tileRect(index);
				if (!tile) continue;
				this.drawCrosshair(
					context,
					tile.x + ((this.sample.x + 0.5) / this.terrain.size) * tile.size,
					tile.y + ((this.sample.y + 0.5) / this.terrain.size) * tile.size,
				);
			}
			return;
		}
		const rect = this.contentRect();
		if (rect.size <= 0) return;
		this.drawCrosshair(
			context,
			rect.x + ((this.sample.x + 0.5) / this.terrain.size) * rect.size,
			rect.y + ((this.sample.y + 0.5) / this.terrain.size) * rect.size,
		);
	}

	private bindPointer() {
		this.canvas.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return;
			this.pointerId = event.pointerId;
			this.dragged = false;
			this.dragStart = {
				x: event.clientX,
				y: event.clientY,
				panX: this.panX,
				panY: this.panY,
			};
			this.canvas.setPointerCapture(event.pointerId);
		});
		this.canvas.addEventListener("pointermove", (event) => {
			if (this.pointerId !== event.pointerId) return;
			const dx = event.clientX - this.dragStart.x;
			const dy = event.clientY - this.dragStart.y;
			if (Math.abs(dx) + Math.abs(dy) > 3) {
				this.dragged = true;
				this.panX = this.dragStart.panX + dx;
				this.panY = this.dragStart.panY + dy;
				this.render();
			}
		});
		const release = (event: PointerEvent) => {
			if (this.pointerId !== event.pointerId) return;
			this.pointerId = null;
			try {
				this.canvas.releasePointerCapture(event.pointerId);
			} catch {
				// A cancelled pointer may already have lost capture.
			}
			if (!this.dragged) {
				const sample = this.screenToImage(event.clientX, event.clientY);
				if (sample) {
					this.sample = sample;
					this.callbacks.onSample(sample);
				}
			}
			this.dragged = false;
			this.render();
		};
		this.canvas.addEventListener("pointerup", release);
		this.canvas.addEventListener("pointercancel", release);
		this.canvas.addEventListener(
			"wheel",
			(event) => {
				event.preventDefault();
				const factor = Math.exp(-event.deltaY * 0.0015);
				this.zoomBy(factor, event.clientX, event.clientY);
			},
			{ passive: false },
		);
	}

	private screenToImage(clientX: number, clientY: number): SamplePoint | null {
		if (!this.terrain) return null;
		const rect = this.canvas.getBoundingClientRect();
		const px = clientX - rect.left;
		const py = clientY - rect.top;
		if (this.mode === "original") {
			for (let index = 0; index < 4; index++) {
				const tile = this.tileRect(index);
				if (
					tile &&
					px >= tile.x &&
					py >= tile.y &&
					px < tile.x + tile.size &&
					py < tile.y + tile.size
				) {
					return {
						x: Math.min(
							this.terrain.size - 1,
							Math.floor(((px - tile.x) / tile.size) * this.terrain.size),
						),
						y: Math.min(
							this.terrain.size - 1,
							Math.floor(((py - tile.y) / tile.size) * this.terrain.size),
						),
						band: index,
					};
				}
			}
			return null;
		}
		const content = this.contentRect();
		if (
			px < content.x ||
			py < content.y ||
			px >= content.x + content.size ||
			py >= content.y + content.size
		) {
			return null;
		}
		return {
			x: Math.min(
				this.terrain.size - 1,
				Math.floor(((px - content.x) / content.size) * this.terrain.size),
			),
			y: Math.min(
				this.terrain.size - 1,
				Math.floor(((py - content.y) / content.size) * this.terrain.size),
			),
			band: this.mode === "single" ? this.singleBand : undefined,
		};
	}
}

export const histogramSummary = histogram;
