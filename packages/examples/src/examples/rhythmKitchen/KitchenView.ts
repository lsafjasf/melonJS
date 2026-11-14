/**
 * melonJS — Rhythm Kitchen example: all-procedural Canvas scene.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	type CanvasRenderer,
	Renderable,
	state,
	type WebGLRenderer,
} from "melonjs";
import type { KitchenStage } from "./KitchenStage";
import {
	BEAT_MS,
	CARD_H,
	CARD_W,
	CARD_X,
	CARD_Y,
	DESIGN_HEIGHT,
	DESIGN_WIDTH,
	HOT_THRESHOLD,
	type Recipe,
	recipeFor,
	type StationState,
} from "./recipes";

type KitchenRenderer = CanvasRenderer | WebGLRenderer;

export class KitchenView extends Renderable {
	private readonly stage: KitchenStage;

	constructor(stage: KitchenStage) {
		super(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
		this.stage = stage;
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override draw(renderer: KitchenRenderer): void {
		const paused = state.isPaused() && this.stage.phase === "playing";
		this.drawRoom(renderer);
		this.drawBeatRail(renderer);

		for (let index = 0; index < this.stage.stations.length; index++) {
			this.drawStation(renderer, this.stage.stations[index], index);
		}

		if (paused || this.stage.phase !== "playing") {
			this.drawOverlay(renderer);
		}
	}

	private drawRoom(renderer: KitchenRenderer): void {
		renderer.setGlobalAlpha(1);
		renderer.setColor("#0b1019");
		renderer.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

		// Tiled wall and counter, all shapes: no image assets anywhere.
		renderer.setColor("#111827");
		for (let x = 0; x < DESIGN_WIDTH; x += 48) {
			renderer.fillRect(x, 0, 2, DESIGN_HEIGHT);
		}
		for (let y = 0; y < DESIGN_HEIGHT; y += 48) {
			renderer.fillRect(0, y, DESIGN_WIDTH, 2);
		}
		renderer.setColor("#0e1624");
		renderer.fillRect(0, 90, DESIGN_WIDTH, 74);
		renderer.setColor("#151d2b");
		renderer.fillRect(0, 592, DESIGN_WIDTH, 128);
		renderer.setColor("#202b3d");
		renderer.fillRect(0, 592, DESIGN_WIDTH, 4);

		const pulse = Math.max(
			0,
			1 - ((this.stage.elapsedMs % BEAT_MS) / BEAT_MS) * 3.2,
		);
		renderer.setColor("#1c2a3f");
		renderer.setGlobalAlpha(pulse * 0.18);
		renderer.fillRect(0, 92, DESIGN_WIDTH, 170);
		renderer.setGlobalAlpha(1);
	}

	private drawBeatRail(renderer: KitchenRenderer): void {
		const x = 32;
		const y = 130;
		const width = 1136;
		const height = 38;
		const beat = this.stage.elapsedMs / BEAT_MS;
		const totalBeats = 24;
		const playX = x + Math.min(1, beat / totalBeats) * width;

		renderer.setColor("#0a0f19");
		renderer.fillRoundRect(x - 6, y - 6, width + 12, height + 12, 12);
		renderer.setColor("#182437");
		renderer.fillRect(x, y, width, height);

		for (let index = 0; index < totalBeats; index++) {
			const cellX = x + (index / totalBeats) * width;
			renderer.setColor(index % 4 === 0 ? "#38506f" : "#25354c");
			renderer.fillRect(cellX + 1, y, 2, height);
		}

		for (const recipe of this.stage.stations.map((station) =>
			recipeFor(station.kind),
		)) {
			this.drawBeatMarker(renderer, recipe.addBeat, "#66d9c8", y, width);
			this.drawBeatMarker(renderer, recipe.takeBeat, "#89e897", y, width);
		}

		renderer.setColor("#ffe9b0");
		renderer.fillRect(
			Math.max(x, Math.min(x + width, playX)) - 2,
			y - 5,
			4,
			height + 10,
		);
		renderer.setGlobalAlpha(0.3);
		renderer.fillRect(x, y + height - 3, Math.min(width, playX - x), 3);
		renderer.setGlobalAlpha(1);

		// Per-station audio identity: boiling, frying and whistling are
		// reinforced by the little colored lamps above the rail.
		for (let index = 0; index < this.stage.stations.length; index++) {
			const station = this.stage.stations[index];
			if (station.phase !== "cooking" && station.phase !== "lifted") {
				continue;
			}
			const recipe = recipeFor(station.kind);
			const lampX = x + 8 + index * 16;
			renderer.setColor(recipe.accent);
			renderer.setGlobalAlpha(
				station.phase === "lifted" ? 0.28 : 0.5 + station.heat * 0.5,
			);
			renderer.fillEllipse(lampX, y - 12, 4, 4);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawBeatMarker(
		renderer: KitchenRenderer,
		beat: number,
		color: string,
		railY: number,
		railWidth: number,
	): void {
		const markerX = 32 + (beat / 24) * railWidth;
		renderer.setColor(color);
		renderer.fillRect(markerX - 1, railY + 5, 2, 28);
		renderer.beginPath();
		renderer.moveTo(markerX - 5, railY - 1);
		renderer.lineTo(markerX + 5, railY - 1);
		renderer.lineTo(markerX, railY + 5);
		renderer.closePath();
		renderer.fill();
		renderer.setColor("#0a0f19");
		renderer.setGlobalAlpha(0.65);
		renderer.fillEllipse(markerX, railY + 20, 2, 2);
		renderer.setGlobalAlpha(1);
	}

	private drawStation(
		renderer: KitchenRenderer,
		station: StationState,
		index: number,
	): void {
		const x = CARD_X[index];
		const recipe = recipeFor(station.kind);
		const active = station.phase === "cooking" || station.phase === "lifted";
		const glow = active ? 0.12 + station.heat * 0.25 : 0.06;
		const beatPulse = Math.max(
			0,
			1 - ((this.stage.elapsedMs % BEAT_MS) / BEAT_MS) * 4,
		);

		renderer.setGlobalAlpha(glow + beatPulse * 0.04);
		renderer.setColor(recipe.accent);
		renderer.fillRoundRect(x - 5, CARD_Y - 5, CARD_W + 10, CARD_H + 10, 22);
		renderer.setGlobalAlpha(1);

		renderer.setColor(station.phase === "burnt" ? "#24191b" : "#151d2c");
		renderer.fillRoundRect(x, CARD_Y, CARD_W, CARD_H, 18);
		renderer.setColor(
			station.phase === "burnt"
				? "#8e3c3c"
				: active
					? recipe.accent
					: "#26364c",
		);
		renderer.lineWidth = station.phase === "served" ? 3 : 2;
		renderer.strokeRoundRect(x + 1, CARD_Y + 1, CARD_W - 2, CARD_H - 2, 17);

		this.drawBadge(renderer, station, x + CARD_W - 28, CARD_Y + 24);
		this.drawEquipment(renderer, station, recipe, x, index);
		this.drawHeatBar(renderer, station, recipe, x);
		this.drawStationTimeline(renderer, station, recipe, x);
	}

	private drawBadge(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		cy: number,
	): void {
		if (station.phase === "served") {
			renderer.setColor("#4fae78");
			renderer.fillEllipse(cx, cy, 13, 13);
			renderer.setColor("#eafff2");
			renderer.lineWidth = 3;
			renderer.beginPath();
			renderer.moveTo(cx - 6, cy);
			renderer.lineTo(cx - 1, cy + 5);
			renderer.lineTo(cx + 7, cy - 6);
			renderer.stroke();
		} else if (station.phase === "burnt") {
			renderer.setColor("#a54444");
			renderer.fillEllipse(cx, cy, 13, 13);
			renderer.setColor("#ffe6e6");
			renderer.lineWidth = 3;
			renderer.strokeLine(cx - 5, cy - 5, cx + 5, cy + 5);
			renderer.strokeLine(cx + 5, cy - 5, cx - 5, cy + 5);
		}
	}

	private drawHeatBar(
		renderer: KitchenRenderer,
		station: StationState,
		recipe: Recipe,
		x: number,
	): void {
		const barX = x + 18;
		const barY = CARD_Y + 270;
		const barW = CARD_W - 36;
		renderer.setColor("#0a0f19");
		renderer.fillRoundRect(barX, barY, barW, 8, 4);
		const heatColor =
			station.heat >= HOT_THRESHOLD
				? "#ff625f"
				: station.heat > 0.55
					? "#ffbf58"
					: recipe.accent;
		renderer.setColor(heatColor);
		renderer.fillRoundRect(barX, barY, Math.max(8, barW * station.heat), 8, 4);
		renderer.setColor("#ff625f");
		renderer.setGlobalAlpha(0.8);
		renderer.fillRect(barX + barW * HOT_THRESHOLD - 1, barY - 3, 2, 14);
		renderer.setGlobalAlpha(1);
	}

	private drawStationTimeline(
		renderer: KitchenRenderer,
		station: StationState,
		recipe: Recipe,
		x: number,
	): void {
		const left = x + 18;
		const top = CARD_Y + 338;
		const width = CARD_W - 36;
		const totalBeats = 24;
		const beat = this.stage.elapsedMs / BEAT_MS;
		const marker = (value: number): number =>
			left + (value / totalBeats) * width;

		renderer.setColor("#0b1220");
		renderer.fillRoundRect(left, top, width, 18, 7);
		renderer.setColor("#2d4058");
		renderer.fillRect(left + 4, top + 8, width - 8, 2);

		renderer.setColor("#66d9c8");
		renderer.fillEllipse(marker(recipe.addBeat), top + 9, 5, 5);
		renderer.setColor("#89e897");
		renderer.fillEllipse(marker(recipe.takeBeat), top + 9, 5, 5);
		renderer.setColor("#ffe9b0");
		renderer.fillRect(
			Math.max(left + 3, Math.min(left + width - 3, marker(beat))) - 1,
			top + 3,
			2,
			12,
		);

		if (station.phase === "cooking" || station.phase === "lifted") {
			renderer.setColor("#ff625f");
			renderer.setGlobalAlpha(0.7);
			renderer.fillRect(marker(recipe.takeBeat + 1.4), top - 2, 2, 22);
			renderer.setGlobalAlpha(1);
		}
	}

	private drawEquipment(
		renderer: KitchenRenderer,
		station: StationState,
		recipe: Recipe,
		x: number,
		index: number,
	): void {
		const cx = x + CARD_W / 2;
		const counterY = CARD_Y + 244;
		const lifted = station.phase === "lifted";
		const liftOffset = lifted ? -28 : 0;
		const vesselY = counterY - 12 + liftOffset;
		const flame =
			station.phase === "served" || station.phase === "burnt"
				? 0
				: station.phase === "idle" || lifted
					? 0.24
					: 0.35 + station.heat * 0.9;

		renderer.setColor("#0a0e16");
		renderer.fillEllipse(cx + 4, counterY + 7, 92, 25);
		renderer.setColor("#182132");
		renderer.fillEllipse(cx, counterY, 84, 20);
		renderer.setColor("#2b3648");
		renderer.fillEllipse(cx, counterY - 2, 72, 14);
		this.drawFlames(renderer, cx, counterY + 2, flame, index + station.heat);

		switch (station.kind) {
			case "soup":
				this.drawSoupPot(renderer, station, cx, vesselY);
				this.drawSoupBubbles(renderer, station, cx, vesselY - 48);
				break;
			case "pan":
				this.drawFryingPan(renderer, station, cx, vesselY);
				this.drawOilSparks(renderer, station, cx, vesselY - 12);
				break;
			case "kettle":
				this.drawKettle(renderer, station, cx, vesselY);
				this.drawTeaBubbles(renderer, station, cx, vesselY - 34);
				break;
		}

		if (lifted) {
			renderer.setColor(recipe.accent);
			renderer.setGlobalAlpha(0.45);
			renderer.strokeLine(cx - 92, vesselY + 24, cx - 76, vesselY + 24);
			renderer.strokeLine(cx + 76, vesselY + 24, cx + 92, vesselY + 24);
			renderer.setGlobalAlpha(1);
		}

		if (station.phase === "burnt") {
			this.drawSmoke(renderer, cx, vesselY - 52, "#20191a", 0.55);
		} else if (
			station.phase === "cooking" ||
			station.phase === "lifted" ||
			station.phase === "served"
		) {
			const steamColor = station.kind === "pan" ? "#d6e4ef" : "#c7ecff";
			this.drawSteam(renderer, cx, vesselY - 62, steamColor, station.heat);
		}
	}

	private drawFlames(
		renderer: KitchenRenderer,
		cx: number,
		baseY: number,
		intensity: number,
		seed: number,
	): void {
		if (intensity <= 0) {
			return;
		}
		const time = this.stage.elapsedMs / 1000;
		for (let index = 0; index < 5; index++) {
			const offset = (index - 2) * 21;
			const flicker = 0.72 + Math.sin(time * 11 + seed + index * 1.7) * 0.2;
			const height = (21 + index * 2) * intensity * flicker;
			const width = 12 + (index === 2 ? 4 : 0);
			renderer.setColor(index % 2 === 0 ? "#ff8b35" : "#ffc14f");
			renderer.setGlobalAlpha(0.72 + intensity * 0.18);
			renderer.beginPath();
			renderer.moveTo(cx + offset - width, baseY);
			renderer.lineTo(cx + offset, baseY - height);
			renderer.lineTo(cx + offset + width, baseY);
			renderer.closePath();
			renderer.fill();
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSoupPot(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		bottomY: number,
	): void {
		const dark = station.phase === "burnt";
		renderer.setColor(dark ? "#181414" : "#29384d");
		renderer.fillRoundRect(cx - 68, bottomY - 74, 136, 72, 25);
		renderer.setColor(dark ? "#241c1a" : "#455a73");
		renderer.fillEllipse(cx, bottomY - 74, 68, 14);
		renderer.setColor(dark ? "#2f211c" : this.brothColor(station));
		renderer.fillEllipse(cx, bottomY - 71, 58, 10);

		renderer.setColor(dark ? "#171313" : "#536b86");
		renderer.lineWidth = 5;
		renderer.strokeLine(cx - 68, bottomY - 46, cx - 88, bottomY - 50);
		renderer.strokeLine(cx + 68, bottomY - 46, cx + 88, bottomY - 50);
		renderer.fillEllipse(cx - 91, bottomY - 50, 9, 13);
		renderer.fillEllipse(cx + 91, bottomY - 50, 9, 13);

		const food = this.foodColor(station, "#d8c5a2", "#a66a3e", "#2a1b16");
		for (let index = 0; index < 4; index++) {
			const mx = cx - 31 + index * 21;
			const my = bottomY - 72 + Math.sin(index * 2.4) * 3;
			renderer.setColor(food);
			renderer.fillEllipse(mx, my - 3, 9, 5);
			renderer.setColor(dark ? "#1b1412" : "#ead8b8");
			renderer.fillRect(mx - 2, my, 4, 6);
		}
	}

	private drawFryingPan(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		bottomY: number,
	): void {
		const dark = station.phase === "burnt";
		renderer.setColor(dark ? "#171313" : "#354255");
		renderer.fillEllipse(cx, bottomY - 8, 92, 22);
		renderer.setColor(dark ? "#211817" : "#171f2c");
		renderer.fillEllipse(cx, bottomY - 12, 79, 15);
		renderer.setColor(dark ? "#1b1413" : "#46546a");
		renderer.lineWidth = 8;
		renderer.strokeLine(cx + 82, bottomY - 12, cx + 137, bottomY - 25);
		renderer.fillRoundRect(cx + 128, bottomY - 31, 24, 11, 5);

		const food = this.foodColor(station, "#f0e5c7", "#d89b46", "#251812");
		for (let index = 0; index < 3; index++) {
			renderer.save();
			renderer.translate(cx - 36 + index * 35, bottomY - 15 + (index % 2) * 3);
			renderer.rotate(-0.14 + index * 0.13);
			renderer.setColor(food);
			renderer.fillRoundRect(-14, -11, 28, 22, 4);
			renderer.setColor(dark ? "#120e0d" : "#fff0c8");
			renderer.setGlobalAlpha(0.35);
			renderer.fillRect(-10, -7, 20, 3);
			renderer.setGlobalAlpha(1);
			renderer.restore();
		}
	}

	private drawKettle(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		bottomY: number,
	): void {
		const dark = station.phase === "burnt";
		renderer.setColor(dark ? "#171313" : "#3a4a60");
		renderer.fillRoundRect(cx - 54, bottomY - 90, 108, 86, 26);
		renderer.setColor(dark ? "#241a18" : "#536883");
		renderer.fillEllipse(cx, bottomY - 90, 54, 15);
		renderer.setColor(dark ? "#2d211d" : "#18222f");
		renderer.fillEllipse(cx, bottomY - 90, 40, 9);

		renderer.setColor(dark ? "#201716" : "#596d85");
		renderer.beginPath();
		renderer.moveTo(cx + 46, bottomY - 62);
		renderer.lineTo(cx + 92, bottomY - 87);
		renderer.lineTo(cx + 88, bottomY - 70);
		renderer.closePath();
		renderer.fill();
		renderer.lineWidth = 7;
		renderer.strokeArc(cx, bottomY - 92, 40, Math.PI, 0);

		const tea = this.foodColor(station, "#b8db8f", "#b9853f", "#1e1410");
		renderer.setColor(tea);
		renderer.setGlobalAlpha(0.9);
		renderer.fillEllipse(cx - 12, bottomY - 36, 14, 3);
		renderer.fillEllipse(cx + 15, bottomY - 31, 11, 3);
		renderer.setGlobalAlpha(1);
	}

	private drawSteam(
		renderer: KitchenRenderer,
		cx: number,
		topY: number,
		color: string,
		heat: number,
	): void {
		const time = this.stage.elapsedMs / 1000;
		renderer.setColor(color);
		for (let index = 0; index < 7; index++) {
			const life = (time * (0.34 + heat * 0.22) + index * 0.143) % 1;
			const x = cx + Math.sin(time * 2.2 + index * 1.9) * (13 + life * 22);
			const y = topY - life * 78;
			const radius = 5 + life * 10;
			renderer.setGlobalAlpha((1 - life) * (0.16 + heat * 0.18));
			renderer.fillEllipse(x, y, radius, radius * 0.78);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSmoke(
		renderer: KitchenRenderer,
		cx: number,
		topY: number,
		color: string,
		alpha: number,
	): void {
		const time = this.stage.elapsedMs / 1000;
		renderer.setColor(color);
		for (let index = 0; index < 8; index++) {
			const life = (time * 0.24 + index * 0.125) % 1;
			renderer.setGlobalAlpha((1 - life) * alpha);
			renderer.fillEllipse(
				cx + Math.sin(index * 2.7 + time) * (12 + life * 24),
				topY - life * 68,
				7 + life * 15,
				6 + life * 12,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawSoupBubbles(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		y: number,
	): void {
		if (station.phase !== "cooking" && station.phase !== "lifted") {
			return;
		}
		const time = this.stage.elapsedMs / 1000;
		renderer.setColor("#d8f7ff");
		for (let index = 0; index < 5; index++) {
			const bubble = (time * 0.7 + index * 0.19) % 1;
			renderer.setGlobalAlpha(0.16 + bubble * 0.24);
			renderer.strokeEllipse(
				cx - 30 + index * 15,
				y - bubble * 6,
				3 + bubble * 4,
				2 + bubble * 3,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawTeaBubbles(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		y: number,
	): void {
		if (station.phase !== "cooking" && station.phase !== "lifted") {
			return;
		}
		const time = this.stage.elapsedMs / 1000;
		renderer.setColor("#e8d5ff");
		for (let index = 0; index < 4; index++) {
			const bubble = (time * 1.1 + index * 0.23) % 1;
			renderer.setGlobalAlpha(0.18 + bubble * 0.32);
			renderer.strokeEllipse(
				cx - 20 + index * 13,
				y - bubble * 8,
				2 + bubble * 5,
				2 + bubble * 4,
			);
		}
		renderer.setGlobalAlpha(1);
	}

	private drawOilSparks(
		renderer: KitchenRenderer,
		station: StationState,
		cx: number,
		y: number,
	): void {
		if (station.phase !== "cooking" && station.phase !== "lifted") {
			return;
		}
		const time = this.stage.elapsedMs / 1000;
		renderer.setColor("#ffd463");
		for (let index = 0; index < 9; index++) {
			const life = (time * (0.8 + station.heat) + index * 0.117) % 1;
			const side = index % 2 === 0 ? -1 : 1;
			const x = cx + side * (18 + ((index * 13) % 62));
			const sparkY = y - life * (16 + (index % 3) * 10);
			renderer.setGlobalAlpha(0.25 + (1 - life) * 0.7);
			renderer.fillEllipse(x, sparkY, 1.4 + station.heat * 1.8, 1.4);
		}
		renderer.setGlobalAlpha(1);
	}

	private brothColor(station: StationState): string {
		if (station.phase === "idle") {
			return "#556b7b";
		}
		if (station.phase === "burnt") {
			return "#2b1c17";
		}
		if (station.phase === "served") {
			return "#d4a55d";
		}
		return station.heat > 0.65 ? "#b77a45" : "#8f6948";
	}

	private foodColor(
		station: StationState,
		raw: string,
		cooked: string,
		burnt: string,
	): string {
		if (station.phase === "burnt") {
			return burnt;
		}
		if (station.phase === "served") {
			return cooked;
		}
		const recipe = recipeFor(station.kind);
		if (station.addedAt === null) {
			return raw;
		}
		const cookWindow = (recipe.takeBeat - recipe.addBeat) * BEAT_MS;
		const progress = Math.min(
			1.4,
			(this.stage.elapsedMs - station.addedAt) / cookWindow,
		);
		if (progress < 0.2) {
			return raw;
		}
		if (progress < 0.82) {
			return cooked;
		}
		return burnt;
	}

	private drawOverlay(renderer: KitchenRenderer): void {
		renderer.setColor("#060a11");
		renderer.setGlobalAlpha(0.74);
		renderer.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
		renderer.setGlobalAlpha(1);

		renderer.setColor("#111a29");
		renderer.fillRoundRect(340, 244, 520, 254, 24);
		renderer.setColor("#334761");
		renderer.lineWidth = 2;
		renderer.strokeRoundRect(341, 245, 518, 252, 23);
		renderer.setColor("#ffcf66");
		renderer.fillRect(392, 244, 416, 3);

		// Pause badge, and a decorative row of beat dots.
		for (let index = 0; index < 12; index++) {
			renderer.setColor(index % 4 === 0 ? "#ffcf66" : "#3d5069");
			renderer.fillEllipse(464 + index * 26, 472, 3, 3);
		}
	}
}
