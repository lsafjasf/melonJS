/**
 * melonJS — Lighthouse Relay canvas rendering.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { Polygon, Renderable, type Renderer } from "melonjs";
import {
	COLORS,
	codeColor,
	ECHO_LONG_MS,
	HEAT_CRITICAL,
	HEAT_WARN,
	LONG_MAX,
	LONG_MIN,
	PANELS,
	PULSE_MAX,
	SHORT_MAX,
	SHORT_MIN,
	VIEW_H,
	VIEW_W,
} from "./constants";
import type { RelayModel } from "./model";

type ShapeRenderer = Renderer & {
	fillPolygon(poly: Polygon): void;
	fillRoundRect(
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number,
	): void;
	strokeRoundRect(
		x: number,
		y: number,
		width: number,
		height: number,
		radius: number,
		fill?: boolean,
	): void;
	strokeArc(
		x: number,
		y: number,
		radius: number,
		start: number,
		end: number,
		antiClockwise?: boolean,
		fill?: boolean,
	): void;
};

const poly = (...coords: number[]): Polygon =>
	new Polygon(
		0,
		0,
		coords as unknown as [
			number,
			number,
			number,
			number,
			number,
			number,
			...number[],
		],
	);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const heatColor = (heat: number): string => {
	if (heat >= HEAT_CRITICAL) {
		return COLORS.red;
	}
	if (heat >= HEAT_WARN) {
		return COLORS.amber;
	}
	if (heat >= 40) {
		return COLORS.amberBright;
	}
	return "#f2edd4";
};

export class RelayView extends Renderable {
	private readonly model: RelayModel;

	constructor(model: RelayModel) {
		super(0, 0, VIEW_W, VIEW_H);
		this.model = model;
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update(): boolean {
		return true;
	}

	override draw(renderer: Renderer): void {
		const r = renderer as ShapeRenderer;
		this.drawBackdrop(r);
		this.drawHeader(r);
		this.drawPanel(r, PANELS.left, COLORS.cyan);
		this.drawPanel(r, PANELS.center, COLORS.amber);
		this.drawPanel(r, PANELS.right, COLORS.amber);
		this.drawLeftPanel(r);
		this.drawStation(r);
		this.drawRightPanel(r);
		if (this.model.phase === "won") {
			this.drawWonOverlay(r);
		}
	}

	private drawBackdrop(r: ShapeRenderer): void {
		r.setColor(COLORS.bg);
		r.fillRect(0, 0, VIEW_W, VIEW_H);

		r.save();
		r.setColor("#0a4553");
		r.setGlobalAlpha(0.11);
		r.fillEllipse(700, 300, 520, 245);
		r.setColor("#1a5965");
		r.setGlobalAlpha(0.07);
		r.fillEllipse(700, 680, 380, 140);
		for (let y = 0; y < VIEW_H; y += 24) {
			r.setColor(COLORS.grid);
			r.setGlobalAlpha(0.035);
			r.fillRect(0, y, VIEW_W, 1);
		}
		r.restore();
	}

	private drawHeader(r: ShapeRenderer): void {
		r.save();
		r.setColor(COLORS.borderSoft);
		r.setGlobalAlpha(0.7);
		r.lineWidth = 1;
		r.strokeLine(30, 93, 1370, 93);
		for (let x = 455; x <= 965; x += 14) {
			r.setColor(COLORS.grid);
			r.fillRect(x, 80, 5, 1);
		}
		r.setColor(COLORS.cyan);
		r.fillRect(454, 80, 52, 2);
		r.setColor(COLORS.amber);
		r.fillRect(716, 80, 52, 2);
		r.restore();
	}

	private drawPanel(
		r: ShapeRenderer,
		panel: { x: number; y: number; w: number; h: number },
		accent: string,
	): void {
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRect(panel.x, panel.y, panel.w, panel.h);
		r.setColor(COLORS.panel);
		r.setGlobalAlpha(0.72);
		r.fillRect(panel.x + 2, panel.y + 2, panel.w - 4, panel.h - 4);
		r.setGlobalAlpha(1);
		r.setColor(COLORS.border);
		r.lineWidth = 1;
		r.strokeRect(panel.x + 0.5, panel.y + 0.5, panel.w - 1, panel.h - 1);
		r.setColor(accent);
		r.fillRect(panel.x, panel.y, panel.w, 2);
		r.setColor(COLORS.borderSoft);
		r.fillRect(panel.x + 8, panel.y + 8, panel.w - 16, 1);

		const corner = 13;
		r.setColor(COLORS.dim);
		r.setGlobalAlpha(0.7);
		r.strokeLine(panel.x + 8, panel.y + 8, panel.x + 8 + corner, panel.y + 8);
		r.strokeLine(panel.x + 8, panel.y + 8, panel.x + 8, panel.y + 8 + corner);
		r.strokeLine(
			panel.x + panel.w - 8 - corner,
			panel.y + panel.h - 8,
			panel.x + panel.w - 8,
			panel.y + panel.h - 8,
		);
		r.strokeLine(
			panel.x + panel.w - 8,
			panel.y + panel.h - 8 - corner,
			panel.x + panel.w - 8,
			panel.y + panel.h - 8,
		);
		r.restore();
	}

	private drawGrid(
		r: ShapeRenderer,
		x: number,
		y: number,
		w: number,
		h: number,
		cols: number,
		rows: number,
	): void {
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRect(x, y, w, h);
		r.setColor(COLORS.grid);
		r.setGlobalAlpha(0.8);
		for (let i = 1; i < cols; i++) {
			const gx = x + (w / cols) * i;
			r.fillRect(gx, y, 1, h);
		}
		for (let i = 1; i < rows; i++) {
			const gy = y + (h / rows) * i;
			r.fillRect(x, gy, w, 1);
		}
		r.setGlobalAlpha(1);
		r.setColor(COLORS.borderSoft);
		r.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		r.restore();
	}

	private drawLeftPanel(r: ShapeRenderer): void {
		const chartX = 58;
		const chartY = 303;
		const chartW = 392;
		const chartH = 106;
		this.drawGrid(r, chartX, chartY, chartW, chartH, 10, 4);

		const endpoint = this.model.clearance === "short" ? 88 : 398;
		const start = 251;
		const shipX = lerp(start, endpoint, this.model.shipProgress / 100);
		const shipY = 365;
		const targetX = endpoint;
		const targetY = 356;
		const color = codeColor(this.model.clearance);

		r.save();
		r.setColor(COLORS.borderSoft);
		r.setLineDash([4, 7]);
		r.lineWidth = 1;
		r.strokeLine(chartX + 16, 380, chartX + chartW - 16, 380);
		r.setLineDash([]);

		r.setColor(color);
		r.setGlobalAlpha(0.14);
		r.fillEllipse(targetX, targetY, 38, 38);
		r.setGlobalAlpha(1);
		r.lineWidth = 2;
		r.strokeEllipse(targetX, targetY, 25, 25);
		r.setColor(COLORS.panelDeep);
		r.fillEllipse(targetX, targetY, 17, 17);
		r.setColor(color);
		r.strokeEllipse(targetX, targetY, 17, 17);
		for (let i = 0; i < 8; i++) {
			const angle = (i / 8) * Math.PI * 2;
			r.strokeLine(
				targetX + Math.cos(angle) * 27,
				targetY + Math.sin(angle) * 27,
				targetX + Math.cos(angle) * 31,
				targetY + Math.sin(angle) * 31,
			);
		}
		r.fillRect(targetX - 1, targetY - 36, 2, 8);

		this.drawBoat(r, shipX, shipY, color);
		r.restore();

		this.drawTrackProgress(r, chartX, 441, chartW, 25);
		this.drawPulseMeter(r);
		this.drawWearMeter(r);
		this.drawMessageBox(r, 58, 684, 392, 116, this.model.toneP1);
	}

	private drawBoat(
		r: ShapeRenderer,
		x: number,
		y: number,
		color: string,
	): void {
		r.save();
		r.setColor(color);
		r.setGlobalAlpha(0.12);
		r.fillEllipse(x, y + 15, 28, 6);
		r.setGlobalAlpha(1);
		r.setColor("#dfe7e6");
		r.fillPolygon(
			poly(x - 17, y + 2, x + 18, y + 2, x + 11, y + 13, x - 11, y + 13),
		);
		r.setColor("#8fa2a5");
		r.fillRect(x - 12, y + 9, 23, 2);
		r.setColor(color);
		r.fillRect(x - 6, y - 7, 12, 9);
		r.setColor("#dfe7e6");
		r.fillRect(x - 3, y - 5, 5, 4);
		r.lineWidth = 1.5;
		r.strokeLine(x + 10, y - 15, x + 10, y + 2);
		r.fillPolygon(poly(x + 10, y - 15, x + 21, y - 11, x + 10, y - 7));
		r.setColor(color);
		r.setGlobalAlpha(0.6);
		r.strokeLine(x - 23, y + 7, x - 30, y + 7);
		r.strokeLine(x - 24, y + 11, x - 34, y + 11);
		r.restore();
	}

	private drawTrackProgress(
		r: ShapeRenderer,
		x: number,
		y: number,
		w: number,
		h: number,
	): void {
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRect(x, y, w, h);
		r.setColor(COLORS.borderSoft);
		r.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		const fillW = (w - 4) * (this.model.shipProgress / 100);
		r.setColor(codeColor(this.model.clearance));
		r.setGlobalAlpha(0.54);
		r.fillRect(x + 2, y + 2, fillW, h - 4);
		r.setGlobalAlpha(0.25);
		for (let i = 1; i < 10; i++) {
			r.fillRect(x + (w / 10) * i, y + 2, 1, h - 4);
		}
		r.restore();
	}

	private drawPulseMeter(r: ShapeRenderer): void {
		const x = 58;
		const y = 574;
		const w = 392;
		const h = 32;
		const secX = (seconds: number): number =>
			x + (Math.min(seconds, PULSE_MAX) / PULSE_MAX) * w;

		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRect(x, y, w, h);

		r.setColor(COLORS.dim);
		r.setGlobalAlpha(0.42);
		r.fillRect(x, y, secX(SHORT_MIN) - x, h);
		r.setGlobalAlpha(1);
		r.setColor(COLORS.cyanDark);
		r.fillRect(secX(SHORT_MIN), y, secX(SHORT_MAX) - secX(SHORT_MIN), h);
		r.setColor(COLORS.panelRaised);
		r.fillRect(secX(SHORT_MAX), y, secX(LONG_MIN) - secX(SHORT_MAX), h);
		r.setColor(COLORS.amberDark);
		r.fillRect(secX(LONG_MIN), y, secX(LONG_MAX) - secX(LONG_MIN), h);
		r.setColor(COLORS.redDark);
		r.fillRect(secX(LONG_MAX), y, x + w - secX(LONG_MAX), h);

		const boundaries = [SHORT_MIN, SHORT_MAX, LONG_MIN, LONG_MAX];
		for (const boundary of boundaries) {
			r.setColor(COLORS.text);
			r.setGlobalAlpha(0.15);
			r.fillRect(secX(boundary), y, 1, h);
		}
		r.setGlobalAlpha(1);

		let marker: number | null = null;
		if (this.model.phase === "beaming") {
			marker = this.model.beamElapsed;
		} else if (this.model.echoCode) {
			marker =
				this.model.echoCode === "short"
					? (SHORT_MIN + SHORT_MAX) / 2
					: (LONG_MIN + LONG_MAX) / 2;
		}
		if (marker !== null) {
			const markerX = secX(marker);
			const markerColor =
				this.model.phase === "beaming"
					? marker >= LONG_MIN && marker <= LONG_MAX
						? COLORS.amberBright
						: marker >= SHORT_MIN && marker <= SHORT_MAX
							? COLORS.cyanBright
							: COLORS.red
					: codeColor(this.model.echoCode);
			r.setColor(markerColor);
			r.setGlobalAlpha(0.45);
			r.fillRect(x, y, markerX - x, h);
			r.setGlobalAlpha(1);
			r.fillRect(markerX - 2, y - 4, 4, h + 8);
			r.fillRect(markerX - 5, y - 4, 10, 3);
		}

		r.setColor(COLORS.border);
		r.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		r.restore();
	}

	private drawWearMeter(r: ShapeRenderer): void {
		const x = 58;
		const y = 659;
		const w = 392;
		const h = 13;
		const gap = 3;
		const segments = 12;
		const segmentW = (w - gap * (segments - 1)) / segments;
		r.save();
		for (let i = 0; i < segments; i++) {
			const ratio = (i + 1) / segments;
			const lit = this.model.wear >= i * (100 / segments);
			r.setColor(
				lit
					? ratio > 0.78
						? COLORS.red
						: ratio > 0.55
							? COLORS.amber
							: COLORS.cyan
					: COLORS.panelRaised,
			);
			r.fillRect(x + i * (segmentW + gap), y, segmentW, h);
		}
		r.setColor(COLORS.border);
		r.strokeRect(x + 0.5, y - 0.5, w - 1, h + 1);
		r.restore();
	}

	private drawMessageBox(
		r: ShapeRenderer,
		x: number,
		y: number,
		w: number,
		h: number,
		tone: string,
	): void {
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRoundRect(x, y, w, h, 4);
		r.setColor(
			tone === "good"
				? COLORS.green
				: tone === "warn"
					? COLORS.amber
					: tone === "bad"
						? COLORS.red
						: COLORS.border,
		);
		r.setGlobalAlpha(tone === "info" ? 0.7 : 0.9);
		r.strokeRoundRect(x + 0.5, y + 0.5, w - 1, h - 1, 4);
		r.restore();
	}

	private drawStation(r: ShapeRenderer): void {
		this.drawTowerBackdrop(r);
		this.drawTowerBody(r);
		this.drawBeam(r);
		this.drawLamp(r);
		this.drawHandshakeRail(r);
		this.drawPromptBox(r);
		this.drawBeatDots(r);
	}

	private drawTowerBackdrop(r: ShapeRenderer): void {
		r.save();
		r.setColor(COLORS.borderSoft);
		r.setGlobalAlpha(0.6);
		r.lineWidth = 1;
		for (let i = 1; i <= 3; i++) {
			r.strokeEllipse(700, 672, 72 + i * 17, 13 + i * 3);
		}
		r.setGlobalAlpha(0.32);
		r.strokeLine(532, 406, 632, 436);
		r.strokeLine(868, 406, 768, 436);
		r.setGlobalAlpha(0.28);
		r.strokeArc(700, 397, 97, Math.PI * 1.08, Math.PI * 1.92);
		r.strokeArc(700, 397, 111, Math.PI * 1.12, Math.PI * 1.88);
		r.restore();
	}

	private drawTowerBody(r: ShapeRenderer): void {
		r.save();
		r.setColor("#141b1d");
		r.setGlobalAlpha(0.9);
		r.fillEllipse(700, 672, 114, 27);
		r.setColor("#2a2420");
		r.fillEllipse(700, 664, 99, 22);
		r.setColor("#bc7756");
		r.setGlobalAlpha(0.58);
		r.fillEllipse(700, 661, 58, 14);
		r.setGlobalAlpha(1);

		r.setColor("#dad6c4");
		r.fillPolygon(poly(669, 402, 731, 402, 746, 660, 654, 660));
		r.setColor("#a9a696");
		r.setGlobalAlpha(0.55);
		r.fillPolygon(poly(731, 402, 746, 660, 715, 660, 713, 402));
		r.setGlobalAlpha(1);

		const band = (y: number, height: number): void => {
			const t = (y - 402) / 258;
			const half = lerp(31, 46, t);
			r.setColor("#b54c38");
			r.fillRect(700 - half + 2, y, half * 2 - 4, height);
			r.setColor("#713126");
			r.fillRect(700 - half + 2, y + height - 2, half * 2 - 4, 2);
		};
		band(456, 17);
		band(541, 17);
		band(619, 17);

		r.setColor(COLORS.borderSoft);
		r.setGlobalAlpha(0.4);
		for (let i = 0; i < 4; i++) {
			r.fillRect(697, 487 + i * 17, 6, 7);
		}
		r.setGlobalAlpha(1);
		r.setColor("#f0df9a");
		r.setGlobalAlpha(0.7);
		for (let i = 0; i < 3; i++) {
			r.fillEllipse(700, 502 + i * 32, 2.2, 2.2);
		}
		r.setGlobalAlpha(1);

		r.setColor("#342c23");
		r.fillRect(618, 393, 164, 10);
		r.setColor("#b98348");
		r.fillRect(634, 388, 132, 6);
		r.setColor("#142027");
		r.fillRect(625, 405, 150, 7);
		r.restore();
	}

	private drawBeam(r: ShapeRenderer): void {
		const shining =
			this.model.beamOn ||
			(this.model.phase === "won" && this.model.handshakes >= 3);
		if (!shining) {
			return;
		}
		const left = this.model.phase === "won" || this.model.aim === "left";
		const right = this.model.phase === "won" || this.model.aim === "right";
		if (left) {
			this.drawBeamSide(r, -1);
		}
		if (right) {
			this.drawBeamSide(r, 1);
		}
	}

	private drawBeamSide(r: ShapeRenderer, direction: -1 | 1): void {
		const originX = 700;
		const originY = 353;
		const endX = originX + direction * 202;
		const endY = 638;
		const pulse = 0.78 + Math.sin(performance.now() * 0.013) * 0.12;

		r.save();
		r.setBlendMode("additive");
		r.setColor(COLORS.cyan);
		r.setGlobalAlpha(0.06 * pulse);
		r.fillPolygon(
			poly(
				originX - 9,
				originY,
				originX + 9,
				originY,
				endX + direction * 32,
				endY + 17,
				endX - direction * 30,
				endY - 14,
			),
		);
		r.setColor(COLORS.cyanBright);
		r.setGlobalAlpha(0.1 * pulse);
		r.lineWidth = 42;
		r.strokeLine(originX, originY, endX, endY);
		r.setGlobalAlpha(0.24 * pulse);
		r.lineWidth = 17;
		r.strokeLine(originX, originY, endX, endY);
		r.setGlobalAlpha(0.72);
		r.setColor("#d9ffff");
		r.lineWidth = 3;
		r.strokeLine(originX, originY, endX, endY);
		r.setColor(COLORS.cyanBright);
		r.setGlobalAlpha(0.13);
		r.fillEllipse(endX, endY, 48, 27);
		r.setGlobalAlpha(0.5);
		r.fillEllipse(endX, endY, 15, 9);
		r.restore();
	}

	private drawLamp(r: ShapeRenderer): void {
		const heat = this.model.heat;
		const lamp = heatColor(heat);
		const flashing =
			this.model.lensFlash > 0 ||
			this.model.beamOn ||
			this.model.phase === "won";
		const pulse =
			this.model.beatPulse * 0.12 + this.model.lensFlash * 0.32 + 0.88;

		r.save();
		r.setBlendMode("additive");
		r.setColor(lamp);
		r.setGlobalAlpha(0.08 * pulse);
		r.fillEllipse(700, 342, 108, 88);
		r.setGlobalAlpha(0.12 * pulse);
		r.fillEllipse(700, 342, 79, 70);
		r.restore();

		r.save();
		r.setColor("#21271f");
		r.fillEllipse(700, 342, 70, 55);
		r.setColor("#3b3e2f");
		r.strokeEllipse(700, 342, 67, 53);
		r.setColor("#10170f");
		r.fillEllipse(700, 342, 53, 47);

		r.setColor(lamp);
		r.setGlobalAlpha(flashing ? 1 : 0.88);
		r.fillEllipse(700, 342, 40, 43);
		r.setGlobalAlpha(1);
		r.setColor("#fffbec");
		r.fillEllipse(700, 338, 34, 37);
		r.setColor(lamp);
		r.fillEllipse(700, 329, 24, 20);
		r.setColor("#776c48");
		r.setGlobalAlpha(0.55);
		r.strokeLine(700, 288, 700, 398);
		r.strokeLine(657, 342, 743, 342);
		r.setGlobalAlpha(1);

		if (heat >= HEAT_WARN) {
			const warning = heat >= HEAT_CRITICAL ? COLORS.red : COLORS.amber;
			r.setColor(warning);
			r.setGlobalAlpha(
				heat >= HEAT_CRITICAL ? 0.25 + this.model.alertFlash * 0.35 : 0.22,
			);
			r.lineWidth = 1.5;
			for (let i = 0; i < 4; i++) {
				const x = 650 + i * 32;
				r.strokeLine(x, 284, x + 5, 269);
				r.strokeLine(x + 5, 269, x + 1, 255);
			}
			r.strokeEllipse(700, 342, 78 + heat * 0.08, 63 + heat * 0.05);
		}
		r.restore();
	}

	private drawHandshakeRail(r: ShapeRenderer): void {
		const y = 678;
		r.save();
		r.setColor(COLORS.borderSoft);
		r.fillRect(612, y, 176, 1);
		for (let i = 0; i < 3; i++) {
			const x = 620 + i * 80;
			const closed = i < this.model.handshakes;
			const current =
				i === this.model.handshakes &&
				this.model.phase !== "won" &&
				this.model.phase !== "jammed";
			const color = closed ? COLORS.green : current ? COLORS.amber : COLORS.dim;
			if (current) {
				r.setColor(COLORS.amber);
				r.setGlobalAlpha(0.15 + this.model.beatPulse * 0.12);
				r.fillEllipse(x, y, 19, 19);
				r.setGlobalAlpha(1);
			}
			r.setColor(color);
			r.fillEllipse(x, y, closed ? 10 : 8, closed ? 10 : 8);
			r.setColor(COLORS.panelDeep);
			r.fillEllipse(x, y, closed ? 5 : 4, closed ? 5 : 4);
		}
		r.restore();
	}

	private drawPromptBox(r: ShapeRenderer): void {
		const x = 520;
		const y = 726;
		const w = 360;
		const h = 46;
		const tone =
			this.model.phase === "won" || this.model.phase === "success"
				? COLORS.green
				: this.model.phase === "jammed" || this.model.lensLocked
					? COLORS.red
					: this.model.phase === "reply"
						? COLORS.amber
						: COLORS.cyan;
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRoundRect(x, y, w, h, 4);
		r.setColor(tone);
		r.setGlobalAlpha(0.8);
		r.strokeRoundRect(x + 0.5, y + 0.5, w - 1, h - 1, 4);
		r.setGlobalAlpha(0.08);
		r.fillRoundRect(x + 4, y + 4, w - 8, h - 8, 3);
		r.restore();
	}

	private drawBeatDots(r: ShapeRenderer): void {
		const y = 792;
		for (let i = 0; i < 4; i++) {
			const x = 664 + i * 24;
			const active = i === this.model.beatIndex;
			r.save();
			r.setColor(active ? COLORS.cyan : COLORS.border);
			r.setGlobalAlpha(active ? 0.65 + this.model.beatPulse * 0.35 : 0.55);
			r.fillEllipse(x, y, active ? 4.5 : 3, active ? 4.5 : 3);
			r.restore();
		}
	}

	private drawRightPanel(r: ShapeRenderer): void {
		const chartX = 964;
		const chartY = 238;
		const chartW = 396;
		const chartH = 114;
		this.drawGrid(r, chartX, chartY, chartW, chartH, 10, 4);

		const pulses = this.model.echoBursts;
		const code = this.model.echoCode;
		const pulseWidth =
			code === "short" ? 26 : code === "long" ? ECHO_LONG_MS / 7 : 28;
		r.save();
		for (let i = 0; i < 3; i++) {
			const x = 1004 + i * 88;
			const y = 301;
			const triggered = pulses[i]
				? this.model.echoElapsed >= pulses[i].start
				: false;
			r.setColor(COLORS.panelRaised);
			r.fillRect(x, y, 70, 8);
			r.setColor(COLORS.border);
			r.setGlobalAlpha(0.55);
			r.fillRect(x, y + 7, 70, 1);
			r.setGlobalAlpha(1);
			if (triggered && code) {
				r.setColor(codeColor(code));
				r.setGlobalAlpha(0.9);
				r.fillRect(x, y, pulseWidth, 8);
				r.setGlobalAlpha(0.18);
				r.fillEllipse(x + pulseWidth - 4, y + 4, 17, 9);
				r.setGlobalAlpha(1);
			}
		}

		const ringX = 1290;
		const ringY = 307;
		const relay = 0.35 + this.model.relayFlash * 0.65;
		r.setColor(COLORS.amber);
		r.setGlobalAlpha(0.08 + this.model.relayFlash * 0.18);
		r.fillEllipse(ringX, ringY, 34, 34);
		r.setGlobalAlpha(1);
		r.setColor(COLORS.border);
		r.lineWidth = 1;
		r.strokeEllipse(ringX, ringY, 27, 27);
		r.strokeEllipse(ringX, ringY, 19, 19);
		r.setColor(COLORS.amber);
		r.setGlobalAlpha(relay);
		r.strokeEllipse(ringX, ringY, 12, 12);
		r.fillEllipse(ringX, ringY, 6, 6);
		r.restore();

		this.drawHeatMeter(r);
		this.drawMessageBox(r, 964, 650, 396, 134, this.model.toneP2);
	}

	private drawHeatMeter(r: ShapeRenderer): void {
		const x = 964;
		const y = 471;
		const w = 396;
		const h = 25;
		const ratio = this.model.heat / 100;
		r.save();
		r.setColor(COLORS.panelDeep);
		r.fillRect(x, y, w, h);
		r.setColor(
			this.model.heat >= HEAT_CRITICAL
				? COLORS.red
				: this.model.heat >= HEAT_WARN
					? COLORS.amber
					: COLORS.green,
		);
		r.setGlobalAlpha(
			this.model.lensLocked ? 0.65 + this.model.alertFlash * 0.3 : 0.85,
		);
		r.fillRect(x + 2, y + 2, (w - 4) * ratio, h - 4);
		r.setGlobalAlpha(0.2);
		r.setColor(COLORS.text);
		for (let i = 1; i < 20; i++) {
			r.fillRect(x + (w / 20) * i, y + 2, 1, h - 4);
		}
		r.setGlobalAlpha(1);
		r.setColor(COLORS.border);
		r.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
		r.restore();
	}

	private drawWonOverlay(r: ShapeRenderer): void {
		r.save();
		r.setColor("#00060a");
		r.setGlobalAlpha(0.64);
		r.fillRect(0, 0, VIEW_W, VIEW_H);
		r.setColor("#d8ffe9");
		r.setGlobalAlpha(0.07);
		r.fillEllipse(700, 338, 330, 260);
		r.setGlobalAlpha(1);
		r.setColor(COLORS.green);
		r.lineWidth = 2;
		r.strokeRoundRect(527, 238, 346, 330, 12);
		r.setColor(COLORS.green);
		r.setGlobalAlpha(0.12);
		r.fillRoundRect(527, 238, 346, 330, 12);
		r.setGlobalAlpha(0.8);
		for (let i = 0; i < 3; i++) {
			const y = 268 + i * 6;
			r.strokeLine(555 + i * 12, y, 845 - i * 12, y);
		}
		r.setGlobalAlpha(0.12);
		r.setColor("#d9ffff");
		r.fillEllipse(700, 342, 105, 96);
		r.restore();
	}
}
