/**
 * melonJS — night estuary HUD.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import type { CanvasRenderer, Renderer } from "melonjs";
import type { Point } from "./world";

export interface HudState {
	seed: number;
	tide: number;
	secondsLeft: number;
	durability: number;
	deployed: number;
	activeZone: number;
	zoneNames: string[];
	zoneDistance: number;
	nearZone: boolean;
	nearDock: boolean;
	allDeployed: boolean;
	loadFactor: number;
	speed: number;
	current: Point;
	routesOk: number;
	routesTotal: number;
	started: boolean;
	finished: boolean;
	failed: boolean;
	message: string;
}

const INK = "#e8f0ea";
const MUTED = "#88a5a0";
const PANEL = "rgba(4, 15, 22, 0.82)";
const ACCENT = "#ffad5c";
const GOOD = "#78e0ae";
const BAD = "#ff705f";

function rounded(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): void {
	context.beginPath();
	context.roundRect(x, y, width, height, radius);
}

function bar(
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	value: number,
	color: string,
): void {
	context.fillStyle = "rgba(255, 255, 255, 0.1)";
	rounded(context, x, y, width, height, height / 2);
	context.fill();
	context.fillStyle = color;
	rounded(context, x, y, Math.max(2, width * value), height, height / 2);
	context.fill();
}

function clock(seconds: number): string {
	const safe = Math.max(0, Math.ceil(seconds));
	const minutes = Math.floor(safe / 60);
	return `${minutes}:${String(safe % 60).padStart(2, "0")}`;
}

export class EstuaryHud {
	draw(
		renderer: Renderer,
		width: number,
		height: number,
		state: HudState,
	): void {
		const context = (renderer as CanvasRenderer).getContext();
		context.save();
		context.textBaseline = "middle";
		context.textAlign = "left";
		this.drawMissionPanel(context, state);
		this.drawTidePanel(context, width, state);
		this.drawPrompts(context, width, height, state);
		if (state.finished || state.failed)
			this.drawEndPanel(context, width, height, state);
		context.restore();
	}

	private drawMissionPanel(
		context: CanvasRenderingContext2D,
		state: HudState,
	): void {
		context.fillStyle = PANEL;
		rounded(context, 20, 20, 340, 176, 12);
		context.fill();
		context.fillStyle = ACCENT;
		context.fillRect(20, 20, 5, 176);
		context.font = "700 20px 'Trebuchet MS', sans-serif";
		context.fillStyle = INK;
		context.fillText("NIGHT ESTUARY", 40, 45);
		context.font = "600 11px 'Trebuchet MS', sans-serif";
		context.fillStyle = MUTED;
		context.fillText(
			`BUOY RUN  ·  SEED ${state.seed}  ·  ROUTES ${state.routesOk}/${state.routesTotal} PASS`,
			40,
			67,
		);
		context.font = "700 11px 'Trebuchet MS', sans-serif";
		context.fillStyle = MUTED;
		context.fillText("MARKERS", 40, 92);
		for (let index = 0; index < 4; index++) {
			const x = 104 + index * 54;
			const deployed = index < state.deployed;
			const active = index === state.activeZone && !state.allDeployed;
			context.fillStyle = deployed
				? GOOD
				: active
					? ACCENT
					: "rgba(136, 165, 160, 0.25)";
			rounded(context, x, 84, 42, 16, 8);
			context.fill();
			if (active) {
				context.strokeStyle = "rgba(255, 173, 92, 0.58)";
				context.lineWidth = 2;
				context.stroke();
			}
		}
		context.fillStyle = INK;
		context.font = "600 13px 'Trebuchet MS', sans-serif";
		const target = state.allDeployed
			? "TARGET  DOCK"
			: `TARGET  ${state.zoneNames[state.activeZone] ?? "BUOY ZONE"}`;
		context.fillText(target, 40, 120);
		context.fillStyle = MUTED;
		context.font = "500 12px 'Trebuchet MS', sans-serif";
		context.fillText(
			`${state.zoneDistance.toFixed(0)} m  ·  LOAD ${state.loadFactor.toFixed(2)}x  ·  ${(state.speed * 6).toFixed(0)} kn`,
			40,
			142,
		);
		context.fillStyle = MUTED;
		context.fillText(
			`CROSSFLOW ${Math.hypot(state.current.x, state.current.y).toFixed(2)}  ·  ${this.currentName(state.current)}`,
			40,
			164,
		);
		this.drawCurrentArrow(context, 318, 160, state.current);
		context.fillStyle = state.message ? ACCENT : MUTED;
		context.font = "600 11px 'Trebuchet MS', sans-serif";
		context.fillText(
			state.message || "ARROWS TO SAIL  ·  SPACE TO DEPLOY",
			40,
			184,
		);
	}

	private currentName(current: Point): string {
		if (Math.abs(current.y) > Math.abs(current.x) * 0.72) {
			return current.y > 0 ? "SOUTHWARD" : "NORTHWARD";
		}
		return current.x > 0 ? "EBB" : "FLOOD";
	}

	private drawCurrentArrow(
		context: CanvasRenderingContext2D,
		x: number,
		y: number,
		current: Point,
	): void {
		const angle = Math.atan2(current.y, current.x);
		context.save();
		context.translate(x, y);
		context.rotate(angle);
		context.strokeStyle = GOOD;
		context.fillStyle = GOOD;
		context.lineWidth = 1.4;
		context.beginPath();
		context.moveTo(-11, 0);
		context.lineTo(10, 0);
		context.stroke();
		context.beginPath();
		context.moveTo(12, 0);
		context.lineTo(5, -4);
		context.lineTo(5, 4);
		context.closePath();
		context.fill();
		context.restore();
	}

	private drawTidePanel(
		context: CanvasRenderingContext2D,
		width: number,
		state: HudState,
	): void {
		context.fillStyle = PANEL;
		rounded(context, width - 300, 20, 280, 126, 12);
		context.fill();
		context.font = "700 11px 'Trebuchet MS', sans-serif";
		context.fillStyle = MUTED;
		context.fillText("TIDE WINDOW", width - 282, 44);
		context.textAlign = "right";
		context.font = "700 24px 'Trebuchet MS', sans-serif";
		context.fillStyle = state.secondsLeft < 30 ? BAD : INK;
		context.fillText(clock(state.secondsLeft), width - 38, 45);
		context.textAlign = "left";
		bar(
			context,
			width - 282,
			68,
			244,
			8,
			state.tide,
			state.secondsLeft < 30 ? BAD : "#5dbcc0",
		);
		context.font = "700 11px 'Trebuchet MS', sans-serif";
		context.fillStyle = MUTED;
		context.fillText("HULL", width - 282, 96);
		context.fillStyle = INK;
		context.textAlign = "right";
		context.fillText(`${Math.ceil(state.durability)}%`, width - 38, 96);
		context.textAlign = "left";
		bar(
			context,
			width - 282,
			112,
			244,
			8,
			state.durability / 100,
			state.durability < 35 ? BAD : GOOD,
		);
		context.font = "500 10px 'Trebuchet MS', sans-serif";
		context.fillStyle = MUTED;
		context.fillText(
			"Rising water pushes the bank into the channel",
			width - 282,
			134,
		);
	}

	private drawPrompts(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		state: HudState,
	): void {
		if (state.finished || state.failed) return;
		context.textAlign = "center";
		context.font = "600 13px 'Trebuchet MS', sans-serif";
		let prompt = "UP / DOWN throttle  ·  LEFT / RIGHT rudder";
		if (!state.started)
			prompt = "ARROW KEY to leave  ·  SPACE inside the amber marker zone";
		else if (state.allDeployed && state.nearDock) prompt = "ENTERING DOCK";
		else if (state.nearZone) prompt = "SPACE to deploy the current buoy";
		context.fillStyle = "rgba(4, 15, 22, 0.7)";
		const promptWidth = Math.min(width - 40, 470);
		rounded(
			context,
			width / 2 - promptWidth / 2,
			height - 58,
			promptWidth,
			34,
			17,
		);
		context.fill();
		context.fillStyle = state.nearZone || state.nearDock ? ACCENT : INK;
		context.fillText(prompt, width / 2, height - 41);
		context.textAlign = "left";
	}

	private drawEndPanel(
		context: CanvasRenderingContext2D,
		width: number,
		height: number,
		state: HudState,
	): void {
		context.fillStyle = "rgba(2, 8, 12, 0.72)";
		context.fillRect(0, 0, width, height);
		context.textAlign = "center";
		context.fillStyle = state.finished ? GOOD : BAD;
		context.font = "700 32px 'Trebuchet MS', sans-serif";
		context.fillText(
			state.finished ? "CHANNEL MARKED" : "THE TIDE HAS WON",
			width / 2,
			height / 2 - 30,
		);
		context.fillStyle = INK;
		context.font = "600 14px 'Trebuchet MS', sans-serif";
		context.fillText(
			state.finished
				? "Four buoys laid. The boat is back at the dock."
				: "The tide flooded the bank before the run was complete.",
			width / 2,
			height / 2 + 6,
		);
		context.fillStyle = MUTED;
		context.font = "500 12px 'Trebuchet MS', sans-serif";
		context.fillText(`SEED ${state.seed}`, width / 2, height / 2 + 34);
		context.fillStyle = ACCENT;
		context.font = "700 12px 'Trebuchet MS', sans-serif";
		context.fillText("PRESS R FOR A NEW SEED", width / 2, height / 2 + 62);
		context.textAlign = "left";
	}
}
