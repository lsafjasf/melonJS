/**
 * melonJS — two-player gantry crane example: input, simulation tick and view.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type Application,
	input,
	Renderable,
	type Renderer,
	type Trail,
} from "melonjs";
import { CraneAudio } from "./audio";
import {
	BEAM_MAX_X,
	BEAM_MIN_X,
	COLORS,
	CRATE_SIZE,
	HOOK_RADIUS,
	PIPES,
	VIEWPORT_H,
	VIEWPORT_W,
	YARD,
} from "./constants";
import type { CraneSimulation, SimEvent } from "./simulation";

type RendererWithAlpha = Renderer & {
	setGlobalAlpha(alpha: number): void;
	getGlobalAlpha(): number;
};

export class GantryCrane extends Renderable {
	private readonly audio = new CraneAudio();
	private readonly trails: Trail[];
	private lastPlaceIndex: number | null = null;

	constructor(
		private readonly app: Application,
		private readonly sim: CraneSimulation,
		trails: Trail[],
	) {
		super(0, 0, VIEWPORT_W, VIEWPORT_H);
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
		this.trails = trails;
	}

	override update(dt: number): boolean {
		if (input.isKeyPressed("restart")) {
			this.sim.restart();
		}

		const controls = {
			beam:
				Number(input.isKeyPressed("beamRight")) -
				Number(input.isKeyPressed("beamLeft")),
			trolley:
				Number(input.isKeyPressed("trolleyBack")) -
				Number(input.isKeyPressed("trolleyForward")),
			hoist:
				Number(input.isKeyPressed("hoistUp")) -
				Number(input.isKeyPressed("hoistDown")),
		};

		this.sim.step(dt, controls);
		this.consumeEvents(this.sim.takeEvents());

		for (let i = 0; i < this.trails.length; i++) {
			const crate = this.sim.crates[i];
			this.trails[i].addPoint(crate.x, crate.y);
		}

		if (this.sim.phase === "playing") {
			this.audio.update(dt, this.sim);
		}

		return true;
	}

	private consumeEvents(events: readonly SimEvent[]): void {
		if (events.length === 0) {
			return;
		}
		this.audio.playEvents(events);
		for (const event of events) {
			if (event.type === "restart") {
				this.lastPlaceIndex = null;
				for (const trail of this.trails) {
					trail.clear();
				}
			} else if (event.type === "collision") {
				this.app.viewport.shake(
					4,
					130,
					this.app.viewport.AXIS.BOTH,
					undefined,
					true,
				);
			} else if (event.type === "place") {
				this.lastPlaceIndex = event.crateIndex ?? null;
				this.app.viewport.shake(
					1.8,
					90,
					this.app.viewport.AXIS.BOTH,
					undefined,
					true,
				);
			}
		}
	}

	override draw(renderer: Renderer): void {
		const r = renderer as RendererWithAlpha;
		this.drawBackground(r);
		this.drawSlots(r);
		this.drawPipes(r);
		this.drawCrates(r);
		this.drawCrane(r);
		this.drawFeedback(r);
		this.drawFrames(r);
	}

	private drawBackground(renderer: RendererWithAlpha): void {
		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.background);
		renderer.fillRect(0, 0, VIEWPORT_W, VIEWPORT_H);

		renderer.setColor(COLORS.yard);
		renderer.fillRect(
			YARD.left,
			YARD.top,
			YARD.right - YARD.left,
			YARD.bottom - YARD.top,
		);

		// Subtle alternating concrete bays; the grid is deliberately quiet so
		// the moving hook and coloured loads own the eye.
		renderer.setGlobalAlpha(0.24);
		renderer.setColor(COLORS.yardAlt);
		for (let y = YARD.top; y < YARD.bottom; y += 88) {
			renderer.fillRect(YARD.left, y, YARD.right - YARD.left, 44);
		}

		renderer.setGlobalAlpha(0.44);
		renderer.setColor(COLORS.grid);
		renderer.lineWidth = 1;
		for (let x = YARD.left; x <= YARD.right; x += 44) {
			renderer.beginPath();
			renderer.moveTo(x, YARD.top);
			renderer.lineTo(x, YARD.bottom);
			renderer.stroke();
		}
		for (let y = YARD.top; y <= YARD.bottom; y += 44) {
			renderer.beginPath();
			renderer.moveTo(YARD.left, y);
			renderer.lineTo(YARD.right, y);
			renderer.stroke();
		}

		// The gantry runs on two rails, one at either edge of the yard.
		const railTop = YARD.top + 24;
		const railBottom = YARD.bottom - 22;
		for (const railY of [railTop, railBottom]) {
			renderer.setGlobalAlpha(0.5);
			renderer.setColor("#030708");
			renderer.lineWidth = 8;
			renderer.beginPath();
			renderer.moveTo(56, railY + 4);
			renderer.lineTo(VIEWPORT_W - 56, railY + 4);
			renderer.stroke();

			renderer.setGlobalAlpha(1);
			renderer.setColor(COLORS.beamShadow);
			renderer.lineWidth = 3;
			renderer.beginPath();
			renderer.moveTo(56, railY);
			renderer.lineTo(VIEWPORT_W - 56, railY);
			renderer.stroke();

			renderer.setGlobalAlpha(0.2);
			renderer.setColor(COLORS.muted);
			renderer.lineWidth = 1;
			for (let x = 62; x < VIEWPORT_W - 56; x += 22) {
				renderer.beginPath();
				renderer.moveTo(x, railY - 5);
				renderer.lineTo(x, railY + 5);
				renderer.stroke();
			}
		}

		renderer.setGlobalAlpha(0.35);
		renderer.setColor(COLORS.panelEdge);
		renderer.lineWidth = 2;
		renderer.strokeRect(
			YARD.left,
			YARD.top,
			YARD.right - YARD.left,
			YARD.bottom - YARD.top,
		);
		renderer.setGlobalAlpha(1);
	}

	private drawSlots(renderer: RendererWithAlpha): void {
		const activeSlot = this.sim.carriedCrate?.targetSlot ?? -1;

		for (const slot of this.sim.slots) {
			const crate = this.sim.crates[slot.index];
			const left = slot.x - slot.width / 2;
			const top = slot.y - slot.height / 2;
			const active = slot.index === activeSlot;

			renderer.setGlobalAlpha(active ? 0.2 : 0.08);
			renderer.setColor(crate.color);
			renderer.fillRect(left, top, slot.width, slot.height);

			renderer.setGlobalAlpha(active ? 1 : 0.62);
			renderer.setColor(crate.color);
			renderer.lineWidth = active ? 3 : 2;
			renderer.strokeRect(left, top, slot.width, slot.height);

			renderer.setGlobalAlpha(active ? 0.9 : 0.38);
			renderer.lineWidth = 3;
			const brace = 15;
			renderer.beginPath();
			renderer.moveTo(left, top + brace);
			renderer.lineTo(left, top);
			renderer.lineTo(left + brace, top);
			renderer.moveTo(left + slot.width - brace, top);
			renderer.lineTo(left + slot.width, top);
			renderer.lineTo(left + slot.width, top + brace);
			renderer.moveTo(left + slot.width, top + slot.height - brace);
			renderer.lineTo(left + slot.width, top + slot.height);
			renderer.lineTo(left + slot.width - brace, top + slot.height);
			renderer.moveTo(left + brace, top + slot.height);
			renderer.lineTo(left, top + slot.height);
			renderer.lineTo(left, top + slot.height - brace);
			renderer.stroke();

			// A row of pips gives each slot its number without asking the
			// immediate-mode renderer to rasterise text.
			const pipY = top + slot.height - 13;
			const pipStart = slot.x - 20;
			for (let pip = 0; pip <= slot.index; pip++) {
				renderer.setGlobalAlpha(0.75);
				renderer.setColor(crate.color);
				renderer.fillRect(pipStart + pip * 9, pipY, 4, 4);
			}

			if (active) {
				renderer.setGlobalAlpha(0.75);
				renderer.setLineDash([7, 5]);
				renderer.setColor(crate.color);
				renderer.lineWidth = 1;
				renderer.beginPath();
				renderer.moveTo(slot.x, top - 12);
				renderer.lineTo(slot.x, top - 3);
				renderer.moveTo(slot.x, top + slot.height + 3);
				renderer.lineTo(slot.x, top + slot.height + 12);
				renderer.stroke();
				renderer.setLineDash([]);
			}
		}

		renderer.setGlobalAlpha(1);
	}

	private drawPipes(renderer: RendererWithAlpha): void {
		for (const pipe of PIPES) {
			const points = pipe.points;
			const hot = this.sim.clearanceBlocked && this.sim.pipeWarning;
			const clear = this.sim.hoistZ >= pipe.clearance + 0.07;

			renderer.setGlobalAlpha(0.45);
			renderer.setColor("#020607");
			renderer.lineWidth = 18;
			renderer.beginPath();
			renderer.moveTo(points[0].x + 5, points[0].y + 7);
			for (let i = 1; i < points.length; i++) {
				renderer.lineTo(points[i].x + 5, points[i].y + 7);
			}
			renderer.stroke();

			renderer.setGlobalAlpha(0.95);
			renderer.setColor(hot ? COLORS.pipeHot : COLORS.pipe);
			renderer.lineWidth = 14;
			renderer.beginPath();
			renderer.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < points.length; i++) {
				renderer.lineTo(points[i].x, points[i].y);
			}
			renderer.stroke();

			renderer.setGlobalAlpha(0.85);
			renderer.setColor("#2f2024");
			renderer.lineWidth = 6;
			renderer.beginPath();
			renderer.moveTo(points[0].x, points[0].y);
			for (let i = 1; i < points.length; i++) {
				renderer.lineTo(points[i].x, points[i].y);
			}
			renderer.stroke();

			renderer.setGlobalAlpha(0.55);
			renderer.setColor("#f0ad79");
			renderer.lineWidth = 1;
			renderer.beginPath();
			renderer.moveTo(points[0].x, points[0].y - 3);
			for (let i = 1; i < points.length; i++) {
				renderer.lineTo(points[i].x, points[i].y - 3);
			}
			renderer.stroke();

			// Flanges at every bend make the conduit read as a built object,
			// not a coloured path.
			for (const point of points) {
				renderer.setGlobalAlpha(0.95);
				renderer.setColor(hot ? "#ffe0a3" : "#b77b66");
				renderer.fillRect(point.x - 9, point.y - 8, 18, 16);
				renderer.setColor("#3b282b");
				renderer.fillRect(point.x - 3, point.y - 8, 6, 16);
			}

			// A clearance tag on each run: safe green once the hook is above
			// the stamped minimum, warning orange while it is not.
			const tag = points[0];
			renderer.setGlobalAlpha(0.8);
			renderer.setColor(clear ? COLORS.safe : COLORS.danger);
			renderer.lineWidth = 2;
			renderer.beginPath();
			renderer.moveTo(tag.x + 20, tag.y - 22);
			renderer.lineTo(tag.x + 20, tag.y - 9);
			renderer.moveTo(tag.x + 14, tag.y - 22);
			renderer.lineTo(tag.x + 26, tag.y - 22);
			renderer.stroke();
			renderer.fillRect(tag.x + 27, tag.y - 25, 5, 5);
		}

		renderer.setGlobalAlpha(1);
	}

	private drawCrates(renderer: RendererWithAlpha): void {
		for (const crate of this.sim.crates) {
			const carried = this.sim.carriedIndex === crate.index;
			const lift = carried ? this.sim.hoistZ : 0;
			const shadowX = crate.x + lift * 18;
			const shadowY = crate.y + lift * 26;

			renderer.setGlobalAlpha(carried ? 0.22 + (1 - lift) * 0.2 : 0.28);
			renderer.setColor("#010303");
			renderer.fillEllipse(
				shadowX - CRATE_SIZE * 0.55,
				shadowY - CRATE_SIZE * 0.2,
				CRATE_SIZE * 1.1,
				CRATE_SIZE * 0.42,
			);

			if (!crate.placed && !carried) {
				renderer.setGlobalAlpha(0.24);
				renderer.setColor(crate.color);
				renderer.setLineDash([5, 4]);
				renderer.lineWidth = 1;
				renderer.strokeRect(crate.pickupX - 40, crate.pickupY - 40, 80, 80);
				renderer.setLineDash([]);
			}

			this.drawCrateBody(
				renderer,
				crate.x,
				crate.y,
				crate.color,
				crate.index,
				carried,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawCrateBody(
		renderer: RendererWithAlpha,
		x: number,
		y: number,
		color: string,
		index: number,
		carried: boolean,
	): void {
		const scale = carried ? 1 + this.sim.hoistZ * 0.08 : 1;
		const size = CRATE_SIZE * scale;
		const left = x - size / 2;
		const top = y - size / 2;

		renderer.setGlobalAlpha(1);
		renderer.setColor("#1c1715");
		renderer.fillRect(left - 3, top - 3, size + 6, size + 6);
		renderer.setColor(color);
		renderer.fillRect(left, top, size, size);

		renderer.setGlobalAlpha(0.45);
		renderer.setColor("#ffffff");
		renderer.fillRect(left + 4, top + 4, size - 8, 4);
		renderer.setGlobalAlpha(1);
		renderer.setColor("#3a211b");
		renderer.lineWidth = 2;
		renderer.strokeRect(left, top, size, size);

		// Steel straps across the lid.
		renderer.setGlobalAlpha(0.58);
		renderer.setColor("#201615");
		renderer.fillRect(x - 4, top + 2, 8, size - 4);
		renderer.fillRect(left + 2, y - 4, size - 4, 8);
		renderer.setGlobalAlpha(0.75);
		renderer.setColor("#e4c7a8");
		renderer.fillRect(left + 3, top + 3, 5, 5);
		renderer.fillRect(left + size - 8, top + 3, 5, 5);
		renderer.fillRect(left + 3, top + size - 8, 5, 5);
		renderer.fillRect(left + size - 8, top + size - 8, 5, 5);

		// Load number as a compact pip code along the bottom edge.
		const pipStart = x - ((index + 1) * 7) / 2;
		for (let pip = 0; pip <= index; pip++) {
			renderer.setGlobalAlpha(0.9);
			renderer.setColor("#fff2d8");
			renderer.fillRect(pipStart + pip * 7, top + size - 9, 3, 3);
		}

		if (carried) {
			renderer.setGlobalAlpha(0.25 + this.sim.hoistZ * 0.35);
			renderer.setColor(COLORS.safe);
			renderer.lineWidth = 2;
			renderer.strokeRect(left - 4, top - 4, size + 8, size + 8);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawCrane(renderer: RendererWithAlpha): void {
		const sim = this.sim;
		const railTop = YARD.top + 24;
		const railBottom = YARD.bottom - 22;
		const beamX = sim.beamX;
		const bridgeHeight = railBottom - railTop;

		// Bridge shadow first: the yellow girder is visibly overhead.
		renderer.setGlobalAlpha(0.42);
		renderer.setColor("#020505");
		renderer.fillRect(beamX - 10, railTop + 7, 34, bridgeHeight + 12);

		renderer.setGlobalAlpha(1);
		renderer.setColor(COLORS.beamShadow);
		renderer.fillRect(beamX - 15, railTop, 30, bridgeHeight);
		renderer.setColor(COLORS.beam);
		renderer.fillRect(beamX - 11, railTop, 22, bridgeHeight);
		renderer.setColor("#8c6d1c");
		renderer.fillRect(beamX + 4, railTop, 5, bridgeHeight);

		// Cross-bracing down the girder.
		renderer.setGlobalAlpha(0.72);
		renderer.setColor("#4f3c12");
		renderer.lineWidth = 2;
		for (let y = railTop + 12; y < railBottom - 8; y += 24) {
			renderer.beginPath();
			renderer.moveTo(beamX - 10, y);
			renderer.lineTo(beamX + 8, y + 10);
			renderer.moveTo(beamX + 10, y);
			renderer.lineTo(beamX - 8, y + 10);
			renderer.stroke();
		}

		for (const railY of [railTop, railBottom]) {
			renderer.setGlobalAlpha(0.45);
			renderer.setColor("#020505");
			renderer.fillRect(beamX - 33, railY - 10, 70, 30);
			renderer.setGlobalAlpha(1);
			renderer.setColor("#5d4715");
			renderer.fillRect(beamX - 30, railY - 13, 60, 26);
			renderer.setColor(COLORS.beam);
			renderer.fillRect(beamX - 24, railY - 9, 48, 18);
			renderer.setColor("#1e1810");
			renderer.fillRect(beamX - 17, railY - 6, 8, 12);
			renderer.fillRect(beamX + 9, railY - 6, 8, 12);
		}

		for (const limitX of [BEAM_MIN_X, BEAM_MAX_X]) {
			for (const railY of [railTop, railBottom]) {
				renderer.setGlobalAlpha(0.8);
				renderer.setColor("#685019");
				renderer.fillRect(limitX - 7, railY - 16, 14, 32);
				renderer.setColor(COLORS.danger);
				renderer.fillRect(limitX - 7, railY - 5, 14, 4);
			}
		}

		// Trolley carriage.
		const trolleyX = sim.beamX;
		const trolleyY = sim.trolleyY;
		renderer.setGlobalAlpha(0.45);
		renderer.setColor("#020505");
		renderer.fillRect(trolleyX - 25, trolleyY - 15, 58, 40);
		renderer.setGlobalAlpha(1);
		renderer.setColor("#2a2416");
		renderer.fillRect(trolleyX - 30, trolleyY - 20, 60, 40);
		renderer.setColor(COLORS.beam);
		renderer.fillRect(trolleyX - 25, trolleyY - 15, 50, 30);
		renderer.setColor("#1c1811");
		renderer.fillRect(trolleyX - 20, trolleyY - 9, 10, 18);
		renderer.fillRect(trolleyX + 10, trolleyY - 9, 10, 18);
		renderer.setColor(COLORS.rightPlayer);
		renderer.fillRect(trolleyX - 3, trolleyY - 11, 6, 22);

		// Hook cable, two strands with a dark separation so it reads even
		// against the striped yard.
		const dx = sim.hookX - trolleyX;
		const dy = sim.hookY - trolleyY;
		const length = Math.max(1, Math.hypot(dx, dy));
		const nx = -dy / length;
		const ny = dx / length;
		renderer.setGlobalAlpha(0.5);
		renderer.setColor("#010303");
		renderer.lineWidth = 5;
		renderer.beginPath();
		renderer.moveTo(trolleyX + 5, trolleyY + 5);
		renderer.lineTo(sim.hookX + 5, sim.hookY + 5);
		renderer.stroke();

		renderer.setGlobalAlpha(0.95);
		renderer.setColor("#9dabc0");
		renderer.lineWidth = 2;
		for (const side of [-2.6, 2.6]) {
			renderer.beginPath();
			renderer.moveTo(trolleyX + nx * side, trolleyY + ny * side);
			renderer.lineTo(sim.hookX + nx * side, sim.hookY + ny * side);
			renderer.stroke();
		}

		// A compact hoist gauge on the trolley's shoulder.
		const gaugeX = trolleyX + 38;
		const gaugeTop = trolleyY - 28;
		renderer.setGlobalAlpha(0.8);
		renderer.setColor("#061013");
		renderer.fillRect(gaugeX, gaugeTop, 6, 56);
		renderer.setColor(sim.clearanceBlocked ? COLORS.danger : COLORS.safe);
		const fillHeight = 52 * sim.hoistZ;
		renderer.fillRect(gaugeX + 1, gaugeTop + 54 - fillHeight, 4, fillHeight);

		if (sim.carriedIndex === null) {
			renderer.setGlobalAlpha(0.26);
			renderer.setColor("#010303");
			renderer.fillEllipse(
				sim.hookX + sim.hoistZ * 18 - 12,
				sim.hookY + sim.hoistZ * 26 - 6,
				24,
				12,
			);
		}

		// Ground projection: larger at height, dashed, and red while the
		// current load is below a conduit it overlaps.
		const projectionRadius = HOOK_RADIUS + 5 + sim.hoistZ * 25;
		const projectionColor = sim.clearanceBlocked
			? COLORS.danger
			: sim.pipeWarning
				? COLORS.safe
				: COLORS.leftPlayer;
		renderer.setGlobalAlpha(0.72);
		renderer.setColor(projectionColor);
		renderer.lineWidth = 1;
		renderer.setLineDash([5, 4]);
		renderer.strokeEllipse(
			sim.hookX - projectionRadius,
			sim.hookY - projectionRadius,
			projectionRadius * 2,
			projectionRadius * 2,
		);
		renderer.setLineDash([]);
		renderer.beginPath();
		renderer.moveTo(sim.hookX - projectionRadius - 6, sim.hookY);
		renderer.lineTo(sim.hookX - projectionRadius + 6, sim.hookY);
		renderer.moveTo(sim.hookX + projectionRadius - 6, sim.hookY);
		renderer.lineTo(sim.hookX + projectionRadius + 6, sim.hookY);
		renderer.moveTo(sim.hookX, sim.hookY - projectionRadius - 6);
		renderer.lineTo(sim.hookX, sim.hookY - projectionRadius + 6);
		renderer.moveTo(sim.hookX, sim.hookY + projectionRadius - 6);
		renderer.lineTo(sim.hookX, sim.hookY + projectionRadius + 6);
		renderer.stroke();

		// The magnet/hook itself.
		renderer.setGlobalAlpha(1);
		renderer.setColor("#151d20");
		renderer.fillEllipse(
			sim.hookX - HOOK_RADIUS - 3,
			sim.hookY - HOOK_RADIUS - 3,
			(HOOK_RADIUS + 3) * 2,
			(HOOK_RADIUS + 3) * 2,
		);
		renderer.setColor(COLORS.beam);
		renderer.fillEllipse(
			sim.hookX - HOOK_RADIUS,
			sim.hookY - HOOK_RADIUS,
			HOOK_RADIUS * 2,
			HOOK_RADIUS * 2,
		);
		renderer.setColor("#2c2414");
		renderer.fillRect(sim.hookX, sim.hookY - 5, HOOK_RADIUS, 10);
		renderer.setGlobalAlpha(1);
	}

	private drawFeedback(renderer: RendererWithAlpha): void {
		const sim = this.sim;
		const carried = sim.carriedCrate;

		if (carried) {
			const slot = sim.slots[carried.targetSlot];
			renderer.setGlobalAlpha(0.18);
			renderer.setColor(carried.color);
			renderer.setLineDash([10, 9]);
			renderer.lineWidth = 2;
			renderer.beginPath();
			renderer.moveTo(sim.hookX, sim.hookY);
			renderer.lineTo(slot.x, slot.y);
			renderer.stroke();
			renderer.setLineDash([]);
		}

		if (sim.placeFlash > 0 && this.lastPlaceIndex !== null) {
			const crate = sim.crates[this.lastPlaceIndex];
			const slot = sim.slots[crate.targetSlot];
			const progress = 1 - sim.placeFlash / 1.2;
			const radius = 42 + progress * 96;
			renderer.setGlobalAlpha((1 - progress) * 0.85);
			renderer.setColor(COLORS.safe);
			renderer.lineWidth = 3;
			renderer.strokeEllipse(
				slot.x - radius,
				slot.y - radius * 0.55,
				radius * 2,
				radius * 1.1,
			);
		}

		if (sim.phase === "playing" && sim.clearanceBlocked) {
			const pulse = 0.55 + Math.sin(sim.runTime * 18) * 0.2;
			renderer.setGlobalAlpha(pulse);
			renderer.setColor(COLORS.danger);
			renderer.lineWidth = 3;
			const x = sim.hookX;
			const y = sim.hookY - 64;
			renderer.beginPath();
			renderer.moveTo(x, y - 17);
			renderer.lineTo(x + 16, y + 13);
			renderer.lineTo(x - 16, y + 13);
			renderer.closePath();
			renderer.stroke();
			renderer.beginPath();
			renderer.moveTo(x, y - 8);
			renderer.lineTo(x, y + 4);
			renderer.moveTo(x, y + 8);
			renderer.lineTo(x, y + 9);
			renderer.stroke();
		}

		renderer.setGlobalAlpha(1);
	}

	private drawFrames(renderer: RendererWithAlpha): void {
		renderer.setGlobalAlpha(0.94);
		renderer.setColor(COLORS.panel);
		renderer.fillRect(0, 0, VIEWPORT_W, 146);
		renderer.fillRect(0, VIEWPORT_H - 35, VIEWPORT_W, 35);

		renderer.setGlobalAlpha(0.85);
		renderer.setColor(COLORS.panelEdge);
		renderer.lineWidth = 1;
		renderer.beginPath();
		renderer.moveTo(0, 145);
		renderer.lineTo(VIEWPORT_W, 145);
		renderer.stroke();
		renderer.beginPath();
		renderer.moveTo(0, VIEWPORT_H - 35);
		renderer.lineTo(VIEWPORT_W, VIEWPORT_H - 35);
		renderer.stroke();

		renderer.setGlobalAlpha(0.05);
		renderer.setColor(COLORS.leftPlayer);
		renderer.fillRect(18, 16, 4, 68);
		renderer.setColor(COLORS.rightPlayer);
		renderer.fillRect(VIEWPORT_W - 22, 16, 4, 68);
		renderer.setGlobalAlpha(1);

		if (this.sim.phase !== "playing") {
			renderer.setGlobalAlpha(0.68);
			renderer.setColor("#020607");
			renderer.fillRect(0, 146, VIEWPORT_W, VIEWPORT_H - 181);
			renderer.setGlobalAlpha(1);
		}

		if (this.sim.hitFlash > 0) {
			const alpha = Math.min(0.4, this.sim.hitFlash * 1.7);
			renderer.setGlobalAlpha(alpha);
			renderer.setColor(COLORS.danger);
			renderer.lineWidth = 12;
			renderer.strokeRect(6, 6, VIEWPORT_W - 12, VIEWPORT_H - 12);
			renderer.setGlobalAlpha(1);
		}
	}
}
