/**
 * melonJS — Thermal Control example: ship / HUD drawing.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { CanvasRenderer, WebGLRenderer } from "melonjs";
import { Renderable, RoundRect } from "melonjs";
import {
	COOLANT_LOW,
	COOLANT_MAX,
	CREW_SAFE_MAX,
	CREW_SAFE_MIN,
	DURATION,
	PROP_MIN_CHARGE,
	SHUTDOWN_LIMIT,
	type ThermalSim,
} from "./simulation";

export const VIEW_W = 1280;
export const VIEW_H = 720;

// compartment rectangles (x, y, w, h)
export const COMP_RECTS = {
	crew: { x: 140, y: 170, w: 300, h: 240 },
	equipment: { x: 490, y: 170, w: 300, h: 240 },
	propulsion: { x: 840, y: 170, w: 300, h: 240 },
} as const;

// vertical valve sliders under each compartment
export const VALVE_SLIDERS = {
	crew: { x: 264, y: 540, w: 26, h: 140 },
	equipment: { x: 614, y: 540, w: 26, h: 140 },
	propulsion: { x: 964, y: 540, w: 26, h: 140 },
} as const;

export const RADIATOR_SLIDER = { x: 60, y: 170, w: 26, h: 240 } as const;
export const PUMP = { x: 616, y: 470, w: 48, h: 40 } as const;

const TEMP_MIN_DRAW = -10;
const TEMP_MAX_DRAW = 60;

type Renderer = CanvasRenderer | WebGLRenderer;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** map a temperature to a blue → teal → amber → red ramp */
export const tempColor = (temp: number, alpha = 1): string => {
	const t = clamp01((temp - TEMP_MIN_DRAW) / (TEMP_MAX_DRAW - TEMP_MIN_DRAW));
	let r: number;
	let g: number;
	let b: number;
	if (t < 0.5) {
		const k = t / 0.5;
		r = lerp(40, 60, k);
		g = lerp(90, 170, k);
		b = lerp(210, 140, k);
	} else {
		const k = (t - 0.5) / 0.5;
		r = lerp(60, 225, k);
		g = lerp(170, 60, k);
		b = lerp(140, 45, k);
	}
	return `rgba(${r | 0},${g | 0},${b | 0},${alpha})`;
};

const tempToGaugeY = (temp: number, top: number, height: number) =>
	top +
	height -
	clamp01((temp - TEMP_MIN_DRAW) / (TEMP_MAX_DRAW - TEMP_MIN_DRAW)) * height;

/**
 * Draws the whole scene: sunlight, ship compartments as heat zones,
 * the coolant loop with animated flow, device states and the gauges.
 */
export class ShipView extends Renderable {
	sim: ThermalSim;
	/** seconds accumulated, drives the flow animation */
	flowPhase = 0;

	constructor(sim: ThermalSim) {
		super(0, 0, VIEW_W, VIEW_H);
		this.anchorPoint.set(0, 0);
		this.sim = sim;
	}

	override update(dt: number) {
		this.flowPhase += dt / 1000;
		return true;
	}

	override draw(renderer: Renderer) {
		this.drawBackground(renderer);
		this.drawRadiator(renderer);
		this.drawCoolantLoop(renderer);
		for (const c of this.sim.list) {
			this.drawCompartment(renderer, c.id);
		}
		this.drawGauges(renderer);
		this.drawAlarmBanner(renderer);
	}

	private drawCompartment(
		renderer: Renderer,
		id: "crew" | "equipment" | "propulsion",
	) {
		const c = this.sim.compartments[id];
		const r = COMP_RECTS[id];
		// hull
		renderer.setColor("#1c222e");
		renderer.fill(new RoundRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 14));
		// heat zone fill
		renderer.setColor(tempColor(c.temp, c.offline ? 0.45 : 0.85));
		renderer.fill(new RoundRect(r.x, r.y, r.w, r.h, 10));
		// hot core glow when close to the shutdown limit
		const hot = clamp01(
			(c.temp - CREW_SAFE_MAX) / (SHUTDOWN_LIMIT - CREW_SAFE_MAX),
		);
		if (hot > 0) {
			renderer.setColor(tempColor(SHUTDOWN_LIMIT + 5, 0.35 * hot));
			renderer.fillEllipse(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.32, r.h * 0.3);
		}
		// frame, red flash while overheated
		const flash =
			c.offline && Math.floor(this.flowPhase * 4) % 2 === 0
				? "#ff5040"
				: "#8d9db5";
		renderer.setColor(flash);
		renderer.lineWidth = 2;
		renderer.stroke(new RoundRect(r.x, r.y, r.w, r.h, 10));
		renderer.lineWidth = 1;
		// auto power-off overlay with reboot progress
		if (c.offline) {
			renderer.setColor("rgba(8,10,14,0.55)");
			renderer.fill(new RoundRect(r.x, r.y, r.w, r.h, 10));
			const progress = c.rebootTimer / 6;
			if (progress > 0) {
				renderer.setColor("#e8c53d");
				renderer.fillRect(r.x + 20, r.y + r.h - 18, (r.w - 40) * progress, 6);
				renderer.setColor("#5a5320");
				renderer.strokeRect(r.x + 20, r.y + r.h - 18, r.w - 40, 6);
			}
		}
		// temperature gauge on the left edge, with the crew safe band
		const gx = r.x - 22;
		renderer.setColor("#10151d");
		renderer.fillRect(gx, r.y, 10, r.h);
		if (id === "crew") {
			const yTop = tempToGaugeY(CREW_SAFE_MAX, r.y, r.h);
			const yBot = tempToGaugeY(CREW_SAFE_MIN, r.y, r.h);
			renderer.setColor("rgba(80,200,110,0.5)");
			renderer.fillRect(gx, yTop, 10, yBot - yTop);
		}
		renderer.setColor(tempColor(c.temp));
		const ny = tempToGaugeY(c.temp, r.y, r.h);
		renderer.fillRect(gx - 2, ny - 2, 14, 4);
		renderer.setColor("#39414f");
		renderer.strokeRect(gx, r.y, 10, r.h);
	}

	private drawGauges(renderer: Renderer) {
		// mission time bar
		renderer.setColor("#10151d");
		renderer.fillRect(400, 18, 480, 16);
		renderer.setColor("#3d9be9");
		renderer.fillRect(400, 18, 480 * clamp01(this.sim.t / DURATION), 16);
		renderer.setColor("#39414f");
		renderer.strokeRect(400, 18, 480, 16);
		// coolant tank
		renderer.setColor("#10151d");
		renderer.fillRect(60, 18, 240, 16);
		renderer.setColor(this.sim.coolantLow ? "#c8842a" : "#2e9ec8");
		renderer.fillRect(60, 18, 240 * (this.sim.coolant / COOLANT_MAX), 16);
		// low-coolant mark
		renderer.setColor("#c8842a");
		renderer.fillRect(60 + 240 * (COOLANT_LOW / COOLANT_MAX) - 1, 16, 2, 20);
		renderer.setColor("#39414f");
		renderer.strokeRect(60, 18, 240, 16);
		// battery
		renderer.setColor("#10151d");
		renderer.fillRect(980, 18, 240, 16);
		renderer.setColor(
			this.sim.battery < PROP_MIN_CHARGE + 5 ? "#c84a2a" : "#3dc86e",
		);
		renderer.fillRect(980, 18, 240 * (this.sim.battery / 100), 16);
		// propulsion minimum-charge mark
		renderer.setColor("#e8c53d");
		renderer.fillRect(980 + 240 * (PROP_MIN_CHARGE / 100) - 1, 16, 2, 20);
		renderer.setColor("#39414f");
		renderer.strokeRect(980, 18, 240, 16);
	}

	private drawAlarmBanner(renderer: Renderer) {
		if (this.sim.alarmLevel === 0) {
			return;
		}
		const level = this.sim.alarmLevel;
		const blink = Math.floor(this.flowPhase * (1.5 + level)) % 2 === 0;
		if (!blink && level >= 2) {
			return;
		}
		const colors = ["", "#7a5a28", "#a03a20", "#c02020"];
		renderer.setColor(colors[level]);
		renderer.fill(new RoundRect(400, 44, 480, 26, 8));
	}

	private drawBackground(renderer: Renderer) {
		// night side → sunlit side as the sunlight transition runs
		const f = this.sim.flux;
		renderer.setColor(
			`rgb(${(8 + 26 * f) | 0},${(10 + 30 * f) | 0},${(18 + 34 * f) | 0})`,
		);
		renderer.fillRect(0, 0, VIEW_W, VIEW_H);
		// sun disc climbing in from the right as the ship leaves the shadow
		if (f > 0.01) {
			renderer.setColor(`rgba(255,236,170,${0.9 * f})`);
			renderer.fillEllipse(1200, 90, 34 + 10 * f, 34 + 10 * f);
			renderer.setColor(`rgba(255,220,120,${0.25 * f})`);
			renderer.fillEllipse(1200, 90, 60 + 30 * f, 60 + 30 * f);
		}
	}

	private drawRadiator(renderer: Renderer) {
		const deploy = this.sim.radiatorActual;
		// mast
		renderer.setColor("#3a4250");
		renderer.fillRect(632, 128, 16, 44);
		// two wing panels that grow out of the mast while deploying
		const wing = 8 + 62 * deploy;
		const glow = this.sim.radiatorTarget > deploy ? 0.4 : 0.9;
		renderer.setColor(`rgba(120,200,235,${glow})`);
		renderer.fillRect(632 - wing, 128, wing, 10);
		renderer.fillRect(648, 128, wing, 10);
		// hinge dots
		renderer.setColor("#9fb2c8");
		renderer.fillEllipse(640, 133, 5, 5);
	}

	private drawCoolantLoop(renderer: Renderer) {
		const low = this.sim.coolantLow;
		const blink = low && Math.floor(this.flowPhase * 3) % 2 === 0;
		const pipeColor = low ? (blink ? "#c8842a" : "#7a5a28") : "#2e7f9e";
		// manifold from the pump to below each compartment
		renderer.setColor(pipeColor);
		renderer.lineWidth = 6;
		renderer.strokeLine(290, 452, 990, 452);
		renderer.strokeLine(640, 452, 640, 470);
		for (const c of this.sim.list) {
			const cx = COMP_RECTS[c.id].x + COMP_RECTS[c.id].w / 2;
			renderer.strokeLine(cx, 410, cx, 452);
		}
		renderer.lineWidth = 1;
		// pump body
		renderer.setColor(low ? "#6e5426" : "#245a70");
		renderer.fill(new RoundRect(PUMP.x, PUMP.y, PUMP.w, PUMP.h, 8));
		renderer.setColor("#cfe8f2");
		renderer.stroke(new RoundRect(PUMP.x, PUMP.y, PUMP.w, PUMP.h, 8));
		// animated flow dots, speed follows each valve's actual opening
		for (const c of this.sim.list) {
			const flow = Math.min(Math.max(c.valveActual, 0), 1);
			if (flow < 0.03 || this.sim.coolant <= 0) {
				continue;
			}
			const cx = COMP_RECTS[c.id].x + COMP_RECTS[c.id].w / 2;
			const speed = 30 * flow * (low ? 0.5 : 1);
			const offset = (this.flowPhase * speed) % 14;
			renderer.setColor(low ? "#e8a33d" : "#7fe3ff");
			for (let y = 448 - offset; y > 412; y -= 14) {
				renderer.fillEllipse(cx, y, 3, 3);
			}
			const manifoldDir = cx < 640 ? 1 : cx > 640 ? -1 : 0;
			if (manifoldDir !== 0) {
				const start = 640 + manifoldDir * 24;
				for (
					let x = start + manifoldDir * offset;
					manifoldDir > 0 ? x < cx : x > cx;
					x += manifoldDir * 14
				) {
					renderer.fillEllipse(x, 452, 3, 3);
				}
			}
		}
	}
}
