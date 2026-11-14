/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	CanvasRenderTarget,
	type Gradient,
	Polygon,
	Renderable,
	type Renderer,
} from "melonjs";
import {
	ICE,
	MASK_H,
	MASK_W,
	MAX_TEMP,
	MELT_TEMP,
	MIN_BODY_INTEGRITY,
	RUN_TIME,
	SHAPES,
	tempColor,
	VIEW_H,
	VIEW_W,
} from "./constants";
import type { GameStatus, IceCutSimulation } from "./simulation";

const clamp = (value: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, value));

const hash01 = (value: number): number => {
	const n = Math.sin(value * 127.1 + 311.7) * 43758.5453;
	return n - Math.floor(n);
};

interface Mote {
	x: number;
	y: number;
	size: number;
	speed: number;
	phase: number;
}

export class Backdrop extends Renderable {
	private sky: Gradient | null = null;
	private horizon: Gradient | null = null;
	private vignette: Gradient | null = null;
	private time = 0;
	private readonly motes: Mote[] = [];

	constructor() {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		for (let i = 0; i < 84; i++) {
			this.motes.push({
				x: Math.floor(hash01(i * 3.17) * VIEW_W),
				y: Math.floor(hash01(i * 5.41 + 9) * VIEW_H),
				size: 0.8 + hash01(i * 7.2) * 2.1,
				speed: 3 + hash01(i * 11.9) * 14,
				phase: hash01(i * 13.3) * Math.PI * 2,
			});
		}
	}

	override onActivateEvent(): void {
		const renderer = this.parentApp.renderer;
		this.sky = renderer.createLinearGradient(0, 0, 0, VIEW_H);
		this.sky.addColorStop(0, "#03080f");
		this.sky.addColorStop(0.42, "#071a27");
		this.sky.addColorStop(0.76, "#071017");
		this.sky.addColorStop(1, "#020508");

		this.horizon = renderer.createRadialGradient(
			VIEW_W * 0.5,
			VIEW_H * 0.46,
			20,
			VIEW_W * 0.5,
			VIEW_H * 0.46,
			VIEW_W * 0.62,
		);
		this.horizon.addColorStop(0, "rgba(43, 157, 184, 0.14)");
		this.horizon.addColorStop(0.58, "rgba(12, 79, 102, 0.05)");
		this.horizon.addColorStop(1, "rgba(0, 0, 0, 0)");

		this.vignette = renderer.createRadialGradient(
			VIEW_W / 2,
			VIEW_H / 2,
			VIEW_W * 0.2,
			VIEW_W / 2,
			VIEW_H / 2,
			VIEW_W * 0.72,
		);
		this.vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
		this.vignette.addColorStop(0.72, "rgba(0, 0, 0, 0.18)");
		this.vignette.addColorStop(1, "rgba(0, 0, 0, 0.72)");
	}

	override update(dt: number): boolean {
		this.time += dt;
		return true;
	}

	override draw(renderer: Renderer): void {
		if (this.sky !== null) {
			renderer.setColor(this.sky);
			renderer.fillRect(0, 0, VIEW_W, VIEW_H);
		}
		if (this.horizon !== null) {
			renderer.setColor(this.horizon);
			renderer.fillRect(0, 0, VIEW_W, VIEW_H);
		}

		renderer.setGlobalAlpha(0.62);
		renderer.setColor("#a7e8ff");
		for (const mote of this.motes) {
			const y =
				((mote.y + this.time * mote.speed * 0.004) % (VIEW_H + 20)) - 10;
			const twinkle = 0.45 + 0.55 * Math.sin(this.time * 0.0017 + mote.phase);
			renderer.setGlobalAlpha(0.16 + twinkle * 0.48);
			renderer.fillRect(mote.x, y, mote.size, mote.size);
		}
		renderer.setGlobalAlpha(1);

		renderer.setColor("#2a7389");
		renderer.setGlobalAlpha(0.14);
		renderer.lineWidth = 1;
		renderer.strokeLine(0, 90, VIEW_W, 90);
		renderer.strokeLine(0, VIEW_H - 44, VIEW_W, VIEW_H - 44);
		renderer.setGlobalAlpha(1);

		if (this.vignette !== null) {
			renderer.setColor(this.vignette);
			renderer.fillRect(0, 0, VIEW_W, VIEW_H);
		}
	}
}

export class IceSurfaceView extends Renderable {
	private readonly target: CanvasRenderTarget;
	private readonly image: ImageData;
	private readonly context: CanvasRenderingContext2D;
	private readonly outlines: Polygon[];
	private renderedVersion = -1;
	private pulse = 0;

	constructor(private readonly model: IceCutSimulation) {
		super(ICE.x, ICE.y, ICE.w, ICE.h);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.target = new CanvasRenderTarget(MASK_W, MASK_H, {
			context: "2d",
			transparent: true,
			antiAlias: false,
		});
		this.context = this.target.context as CanvasRenderingContext2D;
		this.image = this.context.createImageData(MASK_W, MASK_H);
		this.outlines = SHAPES.map(
			(spec) => new Polygon(ICE.x, ICE.y, spec.points),
		);
	}

	override update(dt: number): boolean {
		this.pulse += dt;
		return true;
	}

	override draw(renderer: Renderer): void {
		if (this.renderedVersion !== this.model.maskVersion) {
			this.renderMask();
			this.renderedVersion = this.model.maskVersion;
			this.target.invalidate(renderer);
		}

		renderer.drawImage(
			this.target.canvas,
			0,
			0,
			MASK_W,
			MASK_H,
			this.pos.x,
			this.pos.y,
			ICE.w,
			ICE.h,
		);

		this.drawTargets(renderer);
		this.drawFrame(renderer);
	}

	private renderMask(): void {
		const data = this.image.data;
		const thickness = this.model.thickness;
		const heat = this.model.heat;
		const inside = this.model.inside;
		const noise = this.model.surfaceNoise;
		for (let i = 0; i < thickness.length; i++) {
			const offset = i * 4;
			if (inside[i] === 0) {
				data[offset + 3] = 0;
				continue;
			}
			const depth = clamp(thickness[i] / 100, 0, 1);
			const visualDepth = depth * depth;
			const warmth = clamp(heat[i], 0, 1.5);
			const grain = noise[i];
			if (depth < 0.02) {
				data[offset] = 3;
				data[offset + 1] = 9;
				data[offset + 2] = 18;
				data[offset + 3] = 245;
				continue;
			}
			const dark = 1 - visualDepth;
			data[offset] = clamp(
				12 + visualDepth * 116 + grain * 12 + warmth * 76,
				0,
				255,
			);
			data[offset + 1] = clamp(
				88 + visualDepth * 110 + grain * 10 + warmth * 44,
				0,
				255,
			);
			data[offset + 2] = clamp(
				132 + visualDepth * 96 + grain * 9 + warmth * 34 - dark * 12,
				0,
				255,
			);
			data[offset + 3] = 246;
		}
		this.context.putImageData(this.image, 0, 0);
	}

	private drawTargets(renderer: Renderer): void {
		renderer.lineWidth = 1.4;
		renderer.setGlobalAlpha(0.68);
		renderer.setColor("#0d637a");
		for (const outline of this.outlines) {
			renderer.stroke(outline);
		}

		for (let s = 0; s < this.model.shapes.length; s++) {
			const shape = this.model.shapes[s];
			const outline = this.outlines[s];
			const spec = SHAPES[s];
			const samples = shape.samples;
			renderer.setGlobalAlpha(0.46);
			renderer.lineWidth = 8;
			renderer.setColor("#073746");
			for (let i = 0; i < samples.length; i++) {
				const a = samples[i];
				const b = samples[(i + 1) % samples.length];
				if (!a.hit && !b.hit) {
					continue;
				}
				renderer.strokeLine(ICE.x + a.x, ICE.y + a.y, ICE.x + b.x, ICE.y + b.y);
			}
			if (shape.completed) {
				const shimmer = 0.72 + Math.sin(this.pulse * 0.003 + s) * 0.16;
				renderer.setGlobalAlpha(0.1);
				renderer.setColor("#ffd36b");
				renderer.fill(outline);
				renderer.setGlobalAlpha(shimmer);
				renderer.lineWidth = 2.4;
				renderer.setColor("#ffe39b");
				renderer.stroke(outline);
				continue;
			}

			renderer.setGlobalAlpha(0.98);
			renderer.lineWidth = 2.2;
			renderer.setColor("#ffd76b");
			for (let i = 0; i < samples.length; i++) {
				const a = samples[i];
				const b = samples[(i + 1) % samples.length];
				if (!a.hit && !b.hit) {
					continue;
				}
				renderer.strokeLine(ICE.x + a.x, ICE.y + a.y, ICE.x + b.x, ICE.y + b.y);
			}

			const first = samples[0];
			if (first !== undefined) {
				const pulse = 3.8 + Math.sin(this.pulse * 0.004 + spec.col) * 1.8;
				renderer.setGlobalAlpha(0.95);
				renderer.setColor("#f5fdff");
				renderer.fillEllipse(ICE.x + first.x, ICE.y + first.y, pulse, pulse);
				renderer.setGlobalAlpha(0.22);
				renderer.setColor("#5fe8ff");
				renderer.fillEllipse(
					ICE.x + first.x,
					ICE.y + first.y,
					pulse * 3.2,
					pulse * 3.2,
				);
			}
		}
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 1;
	}

	private drawFrame(renderer: Renderer): void {
		const danger = clamp(
			(this.model.temperature - MELT_TEMP) / (MAX_TEMP - MELT_TEMP),
			0,
			1,
		);
		if (danger > 0) {
			const pulse = 0.55 + Math.sin(this.pulse * 0.009) * 0.25;
			renderer.setGlobalAlpha(0.07 * danger * pulse);
			renderer.setColor("#ff5e36");
			renderer.fillRoundRect(ICE.x, ICE.y, ICE.w, ICE.h, 32);
		}

		renderer.setGlobalAlpha(0.075);
		renderer.setColor("#ffffff");
		renderer.fillRoundRect(ICE.x + 34, ICE.y + 18, ICE.w - 68, 12, 6);
		renderer.setGlobalAlpha(0.42);
		renderer.setColor("#163c4c");
		renderer.lineWidth = 7;
		renderer.strokeRoundRect(ICE.x - 4, ICE.y - 4, ICE.w + 8, ICE.h + 8, 34);
		renderer.setGlobalAlpha(0.48);
		renderer.setColor("#5bd9f4");
		renderer.lineWidth = 1.5;
		renderer.strokeRoundRect(ICE.x, ICE.y, ICE.w, ICE.h, 30);
		renderer.setGlobalAlpha(1);
		renderer.lineWidth = 1;
	}
}

export class CutterView extends Renderable {
	private time = 0;

	constructor(private readonly model: IceCutSimulation) {
		super(0, 0, 1, 1);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update(dt: number): boolean {
		this.time += dt;
		const x = ICE.x + this.model.cutter.x;
		const y = ICE.y + this.model.cutter.y;
		this.setPosition(x, y);
		return true;
	}

	override draw(renderer: Renderer): void {
		const temp = this.model.temperature;
		const danger = clamp((temp - MELT_TEMP) / (MAX_TEMP - MELT_TEMP), 0, 1);
		const working = this.model.status === "running" && temp >= 42;
		const color = tempColor(temp);
		const pulse = 0.5 + 0.5 * Math.sin(this.time * 0.008);
		const glow = 17 + temp * 0.14 + danger * 18;
		const x = this.pos.x;
		const y = this.pos.y;

		renderer.setGlobalAlpha(0.07 + danger * 0.09);
		renderer.setColor(color);
		renderer.fillEllipse(x, y, glow * 1.8, glow * 1.8);
		renderer.setGlobalAlpha(0.18 + danger * 0.12);
		renderer.fillEllipse(x, y, glow, glow);

		renderer.setGlobalAlpha(0.8);
		renderer.setColor(color);
		renderer.lineWidth = 1.6;
		renderer.strokeEllipse(x, y, 10 + pulse * 3, 10 + pulse * 3);

		renderer.lineWidth = 2.2;
		for (let i = 0; i < 3; i++) {
			const a = this.time * 0.004 + (i * Math.PI * 2) / 3;
			renderer.strokeArc(x, y, 15 + working * 3, a, a + Math.PI * 0.42);
		}

		renderer.setGlobalAlpha(0.65);
		renderer.setColor("#eaffff");
		renderer.lineWidth = 1;
		renderer.strokeLine(x - 5, y, x + 5, y);
		renderer.strokeLine(x, y - 5, x, y + 5);
		renderer.setGlobalAlpha(1);
		renderer.fillRect(x - 1.3, y - 1.3, 2.6, 2.6);
	}
}

export class HudView extends Renderable {
	private pulse = 0;

	constructor(private readonly model: IceCutSimulation) {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update(dt: number): boolean {
		this.pulse += dt;
		return true;
	}

	override draw(renderer: Renderer): void {
		this.drawTopBar(renderer);
		this.drawTemperatureConsole(renderer);
		this.drawCutterConsole(renderer);
		if (this.model.status !== "running") {
			this.drawStatusOverlay(renderer);
		}
	}

	private drawTopBar(renderer: Renderer): void {
		renderer.setGlobalAlpha(0.82);
		renderer.setColor("#030b11");
		renderer.fillRoundRect(20, 14, 1240, 76, 14);
		renderer.setGlobalAlpha(0.38);
		renderer.setColor("#2c7084");
		renderer.lineWidth = 1;
		renderer.strokeRoundRect(20, 14, 1240, 76, 14);

		renderer.setGlobalAlpha(0.86);
		renderer.setColor("#78e8ff");
		renderer.fillRect(42, 90, 210, 2);
		renderer.setColor("#ffcc62");
		renderer.fillRect(1000, 90, 238, 2);

		const timePct = clamp(this.model.timeLeft / RUN_TIME, 0, 1);
		this.bar(
			renderer,
			572,
			91,
			136,
			5,
			timePct,
			timePct < 0.18 ? "#ff6b59" : "#62e8ff",
		);

		const integrity = clamp(this.model.stats.bodyIntegrity, 0, 1);
		const integrityColor =
			integrity < MIN_BODY_INTEGRITY ? "#ff6a55" : "#8cf1c6";
		this.bar(renderer, 1032, 58, 196, 8, integrity, integrityColor);

		for (let i = 0; i < this.model.shapes.length; i++) {
			const shape = this.model.shapes[i];
			const x = 558 + i * 66;
			renderer.setGlobalAlpha(shape.completed ? 0.95 : 0.4);
			renderer.setColor(shape.completed ? "#ffd76b" : "#4b8fa3");
			renderer.fillEllipse(x, 72, 5, 5);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawTemperatureConsole(renderer: Renderer): void {
		const x = 26;
		const y = 145;
		const w = 214;
		const h = 500;
		const gaugeX = 66;
		const gaugeY = 262;
		const gaugeW = 34;
		const gaugeH = 314;
		const temp = this.model.temperature;
		const pct = clamp(temp / MAX_TEMP, 0, 1);
		const danger = clamp((temp - MELT_TEMP) / (MAX_TEMP - MELT_TEMP), 0, 1);

		this.panel(renderer, x, y, w, h);
		renderer.setGlobalAlpha(0.08);
		renderer.setColor("#78e8ff");
		for (let line = 0; line < 11; line++) {
			renderer.fillRect(x + 14, y + 72 + line * 36, w - 28, 1);
		}

		renderer.setGlobalAlpha(0.95);
		renderer.setColor("#071921");
		renderer.fillRoundRect(gaugeX, gaugeY, gaugeW, gaugeH, 12);
		renderer.setGlobalAlpha(0.45);
		renderer.setColor("#1d5263");
		renderer.lineWidth = 1;
		renderer.strokeRoundRect(gaugeX, gaugeY, gaugeW, gaugeH, 12);

		const fillH = Math.max(2, (gaugeH - 8) * pct);
		renderer.setGlobalAlpha(0.95);
		renderer.setColor(tempColor(temp));
		renderer.fillRoundRect(
			gaugeX + 4,
			gaugeY + gaugeH - 4 - fillH,
			gaugeW - 8,
			fillH,
			8,
		);
		if (danger > 0) {
			renderer.setGlobalAlpha(0.22 + danger * 0.2);
			renderer.setColor("#ff5b3d");
			renderer.fillRoundRect(
				gaugeX - 7,
				gaugeY - 7,
				gaugeW + 14,
				gaugeH + 14,
				14,
			);
		}

		const idealTop = gaugeY + gaugeH - 4 - (78 / 100) * (gaugeH - 8);
		const idealBottom = gaugeY + gaugeH - 4 - (42 / 100) * (gaugeH - 8);
		renderer.setGlobalAlpha(0.32);
		renderer.setColor("#7dffc8");
		renderer.fillRect(gaugeX + gaugeW + 8, idealTop, 3, idealBottom - idealTop);
		renderer.setGlobalAlpha(0.7);
		renderer.setColor("#5c8e9c");
		for (let i = 0; i <= 10; i++) {
			const ty = gaugeY + (gaugeH / 10) * i;
			renderer.strokeLine(gaugeX + gaugeW + 14, ty, gaugeX + gaugeW + 23, ty);
		}

		const active =
			this.model.status === "running" && temp >= 42 && temp <= MELT_TEMP;
		if (active) {
			renderer.setGlobalAlpha(0.18 + Math.sin(this.pulse * 0.007) * 0.08);
			renderer.setColor("#8cf1c6");
			renderer.fillRoundRect(
				gaugeX + gaugeW + 29,
				idealTop,
				3,
				idealBottom - idealTop,
				1.5,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawCutterConsole(renderer: Renderer): void {
		const x = 1040;
		const y = 145;
		const w = 214;
		const h = 500;
		const speedPct = clamp(this.model.speed / 188, 0, 1);
		const quality = clamp(this.model.edgeQuality, 0, 1);

		this.panel(renderer, x, y, w, h);
		this.bar(renderer, 1058, 236, 178, 9, speedPct, "#62cfff");
		this.bar(
			renderer,
			1058,
			294,
			178,
			9,
			quality,
			quality < 0.34 ? "#ff6b59" : "#8cf1c6",
		);

		renderer.setGlobalAlpha(0.15);
		renderer.setColor("#78e8ff");
		for (let line = 0; line < 8; line++) {
			renderer.fillRect(x + 14, y + 88 + line * 42, w - 28, 1);
		}

		const active = {
			up: this.model.status === "running",
			down: this.model.status === "running",
			left: this.model.status === "running",
			right: this.model.status === "running",
		};
		renderer.setGlobalAlpha(0.78);
		renderer.setColor("#071921");
		renderer.lineWidth = 1;
		this.keycap(renderer, 1113, 346, 54, 42, 0, -1, active.up);
		this.keycap(renderer, 1113, 484, 54, 42, 0, 1, active.down);
		this.keycap(renderer, 1057, 414, 54, 42, -1, 0, active.left);
		this.keycap(renderer, 1169, 414, 54, 42, 1, 0, active.right);
		renderer.setGlobalAlpha(1);
	}

	private drawStatusOverlay(renderer: Renderer): void {
		const status: GameStatus = this.model.status;
		const accent =
			status === "won" ? "#ffd76b" : status === "lost" ? "#ff6a55" : "#5fe8ff";
		const pulse = 0.75 + Math.sin(this.pulse * 0.004) * 0.12;
		renderer.setGlobalAlpha(0.82);
		renderer.setColor("#02070b");
		renderer.fillRoundRect(330, 302, 620, 232, 26);
		renderer.setGlobalAlpha(0.5 * pulse);
		renderer.setColor(accent);
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(332, 304, 616, 228, 26);
		renderer.setGlobalAlpha(0.9);
		renderer.fillRect(357, 330, 54, 3);
		renderer.fillRect(869, 330, 54, 3);
		renderer.setGlobalAlpha(1);
	}

	private panel(
		renderer: Renderer,
		x: number,
		y: number,
		w: number,
		h: number,
	) {
		renderer.setGlobalAlpha(0.77);
		renderer.setColor("#06141d");
		renderer.fillRoundRect(x, y, w, h, 18);
		renderer.setGlobalAlpha(0.3);
		renderer.setColor("#2c7084");
		renderer.lineWidth = 1;
		renderer.strokeRoundRect(x, y, w, h, 18);
		renderer.setGlobalAlpha(0.62);
		renderer.setColor("#56c9e3");
		renderer.fillRect(x + 17, y + 15, w - 34, 2);
	}

	private bar(
		renderer: Renderer,
		x: number,
		y: number,
		w: number,
		h: number,
		pct: number,
		color: string,
	): void {
		renderer.setGlobalAlpha(0.56);
		renderer.setColor("#0b2631");
		renderer.fillRoundRect(x, y, w, h, h / 2);
		renderer.setGlobalAlpha(0.9);
		renderer.setColor(color);
		renderer.fillRoundRect(x, y, Math.max(h, w * clamp(pct, 0, 1)), h, h / 2);
	}

	private keycap(
		renderer: Renderer,
		x: number,
		y: number,
		w: number,
		h: number,
		dx: number,
		dy: number,
		active: boolean,
	): void {
		renderer.setColor(active ? "#0d3544" : "#091c25");
		renderer.fillRoundRect(x, y, w, h, 9);
		renderer.setGlobalAlpha(0.45);
		renderer.setColor(active ? "#6ce8ff" : "#345c68");
		renderer.strokeRoundRect(x, y, w, h, 9);
		renderer.setGlobalAlpha(active ? 0.88 : 0.38);
		renderer.setColor(active ? "#a9f4ff" : "#5b8b98");
		renderer.lineWidth = 2;
		const cx = x + w / 2;
		const cy = y + h / 2;
		renderer.strokeLine(cx - dx * 9, cy - dy * 9, cx + dx * 9, cy + dy * 9);
		renderer.strokeLine(
			cx + dx * 9,
			cy + dy * 9,
			cx + dx * 3 - dy * 7,
			cy + dy * 3 + dx * 7,
		);
		renderer.strokeLine(
			cx + dx * 9,
			cy + dy * 9,
			cx + dx * 3 + dy * 7,
			cy + dy * 3 - dx * 7,
		);
		renderer.setGlobalAlpha(0.9);
	}
}
