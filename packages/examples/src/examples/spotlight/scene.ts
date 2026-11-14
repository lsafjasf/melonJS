/**
 * melonJS — The Last Spotlight example: the Canvas stage.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * All silhouettes, light cones, floor pools, the window reflection and the
 * house are immediate-mode primitives: no textures and no external assets.
 */
import { Renderable, type Renderer } from "melonjs";
import {
	ACTOR_FOCUS_Y,
	AUDIENCE_Y,
	LIGHT_SOURCE_X,
	LIGHT_SOURCE_Y,
	VIEW_H,
	VIEW_W,
	WINDOW,
} from "./constants";
import type { SpotlightActor, SpotlightStage } from "./stage";

type Point = readonly [number, number];

const rgba = (r: number, g: number, b: number, a: number): string =>
	`rgba(${r}, ${g}, ${b}, ${a})`;

export class SpotlightScene extends Renderable {
	private readonly stage: SpotlightStage;

	constructor(stage: SpotlightStage) {
		super(0, 0, VIEW_W, VIEW_H);
		this.stage = stage;
		this.anchorPoint.set(0, 0);
		this.alwaysUpdate = true;
	}

	override update(): boolean {
		return false;
	}

	override draw(renderer: Renderer): void {
		renderer.save();
		renderer.setGlobalAlpha(1);

		this.drawBackdrop(renderer);
		this.drawFloor(renderer);
		this.drawWindow(renderer);
		this.drawAudience(renderer);
		this.drawLight(renderer);
		this.drawActors(renderer);
		this.drawReflection(renderer);
		this.drawCurtains(renderer);
		this.drawLightFixture(renderer);
		this.drawFinale(renderer);
		this.drawOverlay(renderer);

		renderer.restore();
	}

	private fillPoly(
		renderer: Renderer,
		points: readonly Point[],
		color: string,
		alpha = 1,
	): void {
		if (points.length < 3) {
			return;
		}
		renderer.setGlobalAlpha(alpha);
		renderer.setColor(color);
		renderer.beginPath();
		renderer.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) {
			renderer.lineTo(points[i][0], points[i][1]);
		}
		renderer.closePath();
		renderer.fill();
		renderer.setGlobalAlpha(1);
	}

	private strokePoly(
		renderer: Renderer,
		points: readonly Point[],
		color: string,
		width = 1,
		alpha = 1,
	): void {
		if (points.length < 2) {
			return;
		}
		renderer.setGlobalAlpha(alpha);
		renderer.setColor(color);
		renderer.lineWidth = width;
		renderer.beginPath();
		renderer.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) {
			renderer.lineTo(points[i][0], points[i][1]);
		}
		renderer.stroke();
		renderer.setGlobalAlpha(1);
	}

	private drawBackdrop(renderer: Renderer): void {
		renderer.setColor("#08070c");
		renderer.fillRect(0, 0, VIEW_W, VIEW_H);

		renderer.setColor("#0d0a12");
		renderer.fillRect(0, 0, VIEW_W, 152);
		renderer.setColor("#141019");
		renderer.fillRect(106, 118, 988, 332);

		for (let i = 0; i < 7; i++) {
			const x = 110 + i * 140;
			renderer.setColor(i % 2 === 0 ? "#17121c" : "#19131e");
			renderer.fillRect(x, 126, 136, 300);
			renderer.setColor("#241c26");
			renderer.fillRect(x + 12, 138, 2, 282);
		}

		this.fillPoly(
			renderer,
			[
				[142, 398],
				[1058, 398],
				[1022, 432],
				[178, 432],
			],
			"#201823",
		);
		this.fillPoly(
			renderer,
			[
				[178, 432],
				[1022, 432],
				[1058, 398],
				[1058, 420],
				[1022, 452],
				[178, 452],
			],
			"#3c2b20",
			0.8,
		);

		renderer.setColor("#9b7b45");
		renderer.lineWidth = 2;
		renderer.strokeRect(74, 92, VIEW_W - 148, 520);
		renderer.setColor("#4e3824");
		renderer.lineWidth = 8;
		renderer.strokeRect(60, 78, VIEW_W - 120, 548);

		renderer.setColor("#16131a");
		for (let i = 0; i < 7; i++) {
			renderer.fillRect(84 + i * 168, 108, 8, 366);
		}
	}

	private drawFloor(renderer: Renderer): void {
		const floor = [
			[188, 404],
			[1012, 404],
			[1176, 610],
			[24, 610],
		] as const;
		this.fillPoly(renderer, floor, "#211714");

		for (let i = 1; i < 11; i++) {
			const t = i / 11;
			renderer.setColor(rgba(126, 91, 61, 0.16));
			renderer.lineWidth = 1;
			renderer.strokeLine(
				188 + (1176 - 188) * t,
				404,
				24 + (1176 - 24) * t,
				610,
			);
		}

		for (let i = 1; i < 4; i++) {
			const y = 404 + i * i * 17 + i * 14;
			const inset = i * 31;
			this.strokePoly(
				renderer,
				[
					[188 + inset, y],
					[1012 - inset, y],
				],
				rgba(146, 103, 66, 0.18),
				1,
			);
		}

		renderer.setColor("#4b171c");
		renderer.fillRect(20, 606, VIEW_W - 40, 18);
		renderer.setColor("#9d743b");
		renderer.lineWidth = 2;
		renderer.strokeLine(20, 606, VIEW_W - 20, 606);
		renderer.setColor("#0c090d");
		renderer.fillRect(0, 620, VIEW_W, VIEW_H - 620);

		for (let i = 0; i < 3; i++) {
			const x = 180 + i * 420;
			renderer.setColor(rgba(255, 188, 96, 0.16));
			renderer.fillEllipse(x, 610, 16, 2);
			renderer.fillEllipse(VIEW_W - x + 180, 610, 16, 2);
		}
	}

	private drawWindow(renderer: Renderer): void {
		const w = WINDOW;
		const heat = this.stage.windowHeat;
		const flash = this.stage.reflectionFlash;

		renderer.setColor("#403022");
		renderer.fillRect(w.x - 12, w.y - 12, w.width + 24, w.height + 24);
		renderer.setColor("#9d743b");
		renderer.lineWidth = 2;
		renderer.strokeRect(w.x - 8, w.y - 8, w.width + 16, w.height + 16);

		renderer.setColor(flash > 0 ? "#fff9dd" : "#182535");
		renderer.fillRect(w.x, w.y, w.width, w.height);
		renderer.setColor(rgba(133, 197, 230, 0.18 + heat * 0.4));
		renderer.fillRect(w.x + 8, w.y + 8, w.width - 16, w.height - 16);
		renderer.setColor(rgba(255, 250, 220, flash * 0.82 + heat * 0.15));
		renderer.fillRect(w.x + 10, w.y + 10, w.width - 20, w.height - 20);

		renderer.setColor("#8f7447");
		renderer.lineWidth = 3;
		renderer.strokeLine(
			w.x + w.width / 2,
			w.y + 3,
			w.x + w.width / 2,
			w.y + w.height - 3,
		);
		renderer.strokeLine(
			w.x + 3,
			w.y + w.height / 2,
			w.x + w.width - 3,
			w.y + w.height / 2,
		);

		renderer.setColor(rgba(255, 255, 255, 0.2 + heat * 0.5));
		renderer.lineWidth = 1;
		renderer.strokeLine(w.x + 18, w.y + 18, w.x + 62, w.y + w.height - 20);
		renderer.strokeLine(w.x + w.width - 24, w.y + 20, w.x + 74, w.y + 74);

		if (flash > 0) {
			const cx = w.x + w.width / 2;
			const cy = w.y + w.height / 2;
			renderer.setColor(rgba(255, 249, 213, flash * 0.65));
			renderer.fillEllipse(cx, cy, 34 + flash * 18, 34 + flash * 18);
			renderer.lineWidth = 2 + flash * 3;
			for (let i = 0; i < 8; i++) {
				const angle = (i / 8) * Math.PI * 2 + this.stage.time / 800;
				renderer.strokeLine(
					cx + Math.cos(angle) * 44,
					cy + Math.sin(angle) * 44,
					cx + Math.cos(angle) * (94 + flash * 56),
					cy + Math.sin(angle) * (94 + flash * 56),
				);
			}
		}
	}

	private drawAudience(renderer: Renderer): void {
		renderer.setColor("#0a080d");
		renderer.fillRect(0, AUDIENCE_Y - 8, VIEW_W, VIEW_H - AUDIENCE_Y + 8);

		renderer.setColor("#241118");
		renderer.fillRect(0, AUDIENCE_Y + 14, 118, 56);
		renderer.fillRect(VIEW_W - 118, AUDIENCE_Y + 14, 118, 56);
		renderer.setColor("#3e2422");
		renderer.fillRect(0, AUDIENCE_Y + 20, 8, 42);
		renderer.fillRect(VIEW_W - 8, AUDIENCE_Y + 20, 8, 42);

		const clapping = this.stage.phase === "curtainCall";
		const gasping =
			this.stage.reflectionFlash > 0.25 || this.stage.phase === "failed";
		const spill = this.stage.houseSpill;
		for (let row = 0; row < 3; row++) {
			const y = AUDIENCE_Y + 12 + row * 20;
			const count = 21 - row * 2;
			const spacing = (VIEW_W - 150) / count;
			for (let i = 0; i < count; i++) {
				const x = 76 + spacing * (i + 0.5);
				const jitter =
					Math.sin(this.stage.time / (clapping ? 140 : 900) + i * 2.1 + row) *
					(clapping ? 2.2 : 0.45);
				const headR = 11 - row * 1.3;
				const shoulderW = headR * 3.1;
				const glow = spill && this.stage.aimY > AUDIENCE_Y - 40;
				renderer.setColor(
					glow
						? rgba(247, 198, 128, 0.35)
						: gasping && i % 4 === 0
							? "#36282a"
							: "#171219",
				);
				renderer.fillEllipse(x, y + jitter, headR, headR * 1.1);
				renderer.fillRect(
					x - shoulderW / 2,
					y + headR + jitter,
					shoulderW,
					15 - row * 2,
				);
			}
		}
	}

	private drawActors(renderer: Renderer): void {
		for (let i = 0; i < this.stage.actors.length; i++) {
			this.drawActor(
				renderer,
				this.stage.actors[i] as SpotlightActor,
				i,
				this.stage.litActors[i] === true,
			);
		}
	}

	private drawActor(
		renderer: Renderer,
		actor: SpotlightActor,
		index: number,
		lit: boolean,
	): void {
		const stage = this.stage;
		const beam = stage.beam;
		const x = actor.x;
		const feetY = actor.y;
		const active = actor.active;
		const bob = active
			? Math.sin(stage.cueElapsed / 330) * 1.8
			: Math.sin(stage.time / 1100 + index * 2) * 0.8;
		const hipY = feetY - 70 + bob;
		const shoulderY = feetY - 125 + bob;
		const headY = feetY - 151 + bob;
		const body = lit ? "#322218" : "#0e0b11";
		const edge = lit ? beam.core : "#19131c";
		const pose = stage.time / 480 + index * 1.7;
		const lift = active ? Math.sin(pose) * 18 : Math.sin(pose) * 2;

		renderer.setColor("#070609");
		renderer.fillEllipse(x, feetY + 7, 45, 8);

		if (lit) {
			renderer.setColor(beam.halo);
			renderer.fillEllipse(x, ACTOR_FOCUS_Y, beam.radiusX * 0.7, 104);
		}

		renderer.setColor(body);
		renderer.lineWidth = 9;
		renderer.strokeLine(x - 8, hipY, x - 16, feetY - 4);
		renderer.strokeLine(x + 8, hipY, x + 18, feetY - 4);

		this.fillPoly(
			renderer,
			[
				[x - 24, shoulderY + 2],
				[x + 24, shoulderY + 2],
				[x + 17, hipY - 4],
				[x - 17, hipY - 4],
			],
			body,
		);
		renderer.fillEllipse(x, headY, 14, 16);

		renderer.lineWidth = 7;
		if (index === 0) {
			renderer.strokeLine(
				x - 19,
				shoulderY + 10,
				x - 58,
				shoulderY + 16 - lift,
			);
			renderer.strokeLine(
				x + 19,
				shoulderY + 10,
				x + 58,
				shoulderY + 16 + lift,
			);
		} else if (index === 1) {
			renderer.strokeLine(x - 18, shoulderY + 12, x - 28, hipY + 8);
			renderer.strokeLine(
				x + 18,
				shoulderY + 12,
				x + 48,
				shoulderY + 20 - lift,
			);
		} else {
			renderer.strokeLine(
				x - 18,
				shoulderY + 12,
				x - 44,
				shoulderY + 42 + lift,
			);
			renderer.strokeLine(x + 18, shoulderY + 12, x + 34, hipY + 4);
		}

		renderer.setColor(edge);
		renderer.lineWidth = lit ? 2 : 1;
		renderer.strokeLine(x - 24, shoulderY + 3, x - 12, headY - 10);
		renderer.strokeLine(x - 12, headY - 10, x - 11, headY + 14);
		renderer.strokeLine(x - 17, hipY - 4, x - 16, feetY - 2);

		if (active) {
			const pulse = 0.55 + 0.45 * Math.sin(stage.cueElapsed / 190);
			renderer.setColor(rgba(248, 208, 111, 0.55 + pulse * 0.3));
			renderer.lineWidth = 2;
			renderer.strokeEllipse(x, feetY + 5, 48 + pulse * 6, 9 + pulse * 2);
			this.fillPoly(
				renderer,
				[
					[x, headY - 43 - pulse * 5],
					[x - 7, headY - 30 - pulse * 5],
					[x + 7, headY - 30 - pulse * 5],
				],
				"#f4cf75",
				0.75,
			);
		}
	}

	private drawLight(renderer: Renderer): void {
		const stage = this.stage;
		const beam = stage.beam;
		const { aimX, aimY } = stage;
		const sourceX = LIGHT_SOURCE_X;
		const sourceY = LIGHT_SOURCE_Y;
		const outer = beam.radiusX * 1.08;
		const inner = beam.radiusX * 0.62;

		this.fillPoly(
			renderer,
			[
				[sourceX, sourceY],
				[aimX - outer, aimY],
				[aimX + outer, aimY],
			],
			beam.halo,
			0.46 + stage.modePulse * 0.1,
		);
		this.fillPoly(
			renderer,
			[
				[sourceX, sourceY],
				[aimX - inner, aimY],
				[aimX + inner, aimY],
			],
			beam.core,
			0.075 + stage.modePulse * 0.03,
		);
		renderer.setColor(beam.halo);
		renderer.fillEllipse(aimX, aimY, beam.radiusX, beam.radiusY);
		renderer.setColor(beam.core);
		renderer.fillEllipse(aimX, aimY, beam.radiusX * 0.7, beam.radiusY * 0.7);
		renderer.setColor(rgba(255, 255, 255, 0.12));
		renderer.fillEllipse(aimX, aimY, beam.radiusX * 0.3, beam.radiusY * 0.3);

		const reflectionY = Math.min(605, aimY + beam.radiusY * 0.62);
		renderer.setColor(beam.halo);
		renderer.fillEllipse(
			aimX,
			reflectionY,
			beam.radiusX * 1.08,
			beam.radiusY * 0.22,
		);
		renderer.setColor(rgba(255, 242, 205, 0.1));
		renderer.fillEllipse(
			aimX,
			Math.min(Math.max(0, reflectionY), 616),
			beam.radiusX * 0.64,
			beam.radiusY * 0.15,
		);

		if (stage.modePulse > 0) {
			renderer.setColor(beam.rim);
			renderer.lineWidth = 1 + stage.modePulse * 2;
			renderer.strokeEllipse(
				aimX,
				aimY,
				beam.radiusX * 0.92,
				beam.radiusY * 0.92,
			);
		}

		if (stage.windowHit && stage.windowHeat > 0.08) {
			renderer.setColor(rgba(255, 248, 214, stage.windowHeat * 0.28));
			renderer.fillEllipse(
				WINDOW.x + WINDOW.width / 2,
				WINDOW.y + WINDOW.height / 2,
				48 + stage.windowHeat * 28,
				48 + stage.windowHeat * 28,
			);
		}
	}

	private drawReflection(renderer: Renderer): void {
		const flash = this.stage.reflectionFlash;
		if (flash <= 0) {
			return;
		}
		const startX = WINDOW.x + WINDOW.width / 2;
		const startY = WINDOW.y + WINDOW.height / 2;
		const endX = 166;
		const endY = 520 + Math.sin(this.stage.time / 460) * 18;

		this.fillPoly(
			renderer,
			[
				[startX, startY - 10],
				[startX, startY + 10],
				[endX + 76, endY + 48],
				[endX - 54, endY - 38],
			],
			rgba(255, 250, 225, 0.3),
			flash,
		);
		this.fillPoly(
			renderer,
			[
				[startX, startY - 4],
				[startX, startY + 4],
				[endX + 23, endY + 17],
				[endX - 16, endY - 12],
			],
			"#fffdf1",
			flash * 0.72,
		);
		renderer.setColor(rgba(255, 245, 199, 0.42 * flash));
		renderer.fillEllipse(endX, endY, 98, 55);
		renderer.setColor(rgba(255, 255, 255, 0.72 * flash));
		renderer.fillEllipse(endX, endY, 24, 15);

		renderer.setColor(rgba(255, 249, 217, 0.22 * flash));
		renderer.fillRect(0, AUDIENCE_Y - 12, VIEW_W, 74);
	}

	private drawCurtains(renderer: Renderer): void {
		const open = this.stage.curtainOpen;
		const leftWidth = 114 + 472 * (1 - open);
		const rightStart = VIEW_W - leftWidth;
		const foldLines = 8;

		this.fillPoly(
			renderer,
			[
				[0, 90],
				[leftWidth, 90],
				[leftWidth + 12, 610],
				[0, 610],
			],
			"#3a0d18",
		);
		for (let i = 1; i < foldLines; i++) {
			const x = (leftWidth / foldLines) * i;
			renderer.setColor(i % 2 === 0 ? "#5b1522" : "#280912");
			renderer.lineWidth = 3;
			renderer.strokeLine(x, 96, x + 8, 602);
		}
		renderer.setColor("#9a6b35");
		renderer.lineWidth = 3;
		renderer.strokeLine(leftWidth, 92, leftWidth + 12, 610);

		this.fillPoly(
			renderer,
			[
				[rightStart, 90],
				[VIEW_W, 90],
				[VIEW_W, 610],
				[rightStart - 12, 610],
			],
			"#3a0d18",
		);
		for (let i = 1; i < foldLines; i++) {
			const x = VIEW_W - (leftWidth / foldLines) * i;
			renderer.setColor(i % 2 === 0 ? "#5b1522" : "#280912");
			renderer.lineWidth = 3;
			renderer.strokeLine(x, 96, x - 8, 602);
		}
		renderer.setColor("#9a6b35");
		renderer.lineWidth = 3;
		renderer.strokeLine(rightStart, 92, rightStart - 12, 610);

		renderer.setColor("#430f1b");
		renderer.fillRect(0, 76, VIEW_W, 50);
		renderer.setColor("#2a0810");
		for (let i = 0; i < 14; i++) {
			const x = i * (VIEW_W / 14);
			this.fillPoly(
				renderer,
				[
					[x, 126],
					[x + VIEW_W / 28, 148],
					[x + VIEW_W / 14, 126],
				],
				"#2a0810",
			);
		}
		renderer.setColor("#b48648");
		renderer.lineWidth = 3;
		renderer.strokeLine(0, 126, VIEW_W, 126);
	}

	private drawLightFixture(renderer: Renderer): void {
		const stage = this.stage;
		renderer.setColor("#141218");
		renderer.fillRect(LIGHT_SOURCE_X - 9, 0, 18, 96);
		renderer.setColor("#232029");
		renderer.fillRect(LIGHT_SOURCE_X - 36, 88, 72, 24);
		renderer.setColor("#0a090c");
		renderer.fillEllipse(LIGHT_SOURCE_X, LIGHT_SOURCE_Y + 8, 24, 10);
		renderer.setColor(stage.beam.rim);
		renderer.fillEllipse(LIGHT_SOURCE_X, LIGHT_SOURCE_Y + 10, 10, 4);
		renderer.setColor(rgba(255, 255, 255, 0.45));
		renderer.fillEllipse(LIGHT_SOURCE_X - 3, LIGHT_SOURCE_Y + 9, 3, 2);
	}

	private drawFinale(renderer: Renderer): void {
		if (this.stage.phase !== "curtainCall") {
			return;
		}
		renderer.setColor(rgba(255, 203, 98, 0.055));
		renderer.fillRect(0, 0, VIEW_W, VIEW_H);

		const total = 38;
		const colors = ["#f6cf74", "#e76f6b", "#7cc7c4", "#c89eeb", "#f3e7ce"];
		for (let i = 0; i < total; i++) {
			const x =
				44 +
				((i * 79) % 1112) +
				Math.sin(this.stage.finaleTime / 680 + i * 1.8) * 18;
			const y = 28 + ((i * 47 + this.stage.finaleTime * 0.16) % 574);
			const angle = this.stage.finaleTime / 900 + i;
			const width = 4 + (i % 4);
			const height = 8 + (i % 3) * 2;
			renderer.setColor(colors[i % colors.length] as string);
			renderer.setGlobalAlpha(0.55 + (i % 3) * 0.15);
			renderer.save();
			renderer.translate(x, y);
			renderer.rotate(angle);
			renderer.fillRect(-width / 2, -height / 2, width, height);
			renderer.restore();
			renderer.setGlobalAlpha(1);
		}
	}

	private drawOverlay(renderer: Renderer): void {
		if (!this.stage.overlayVisible) {
			return;
		}
		const ready = this.stage.phase === "ready" && !this.stage.userPaused;
		const failure = this.stage.phase === "failed";
		const bravo = this.stage.phase === "curtainCall";
		const alpha = ready ? 0.32 : failure ? 0.66 : bravo ? 0.42 : 0.58;
		renderer.setColor(rgba(5, 4, 7, alpha));
		renderer.fillRect(0, 0, VIEW_W, VIEW_H);

		renderer.setColor(failure ? "#6d1f25" : "#453521");
		renderer.lineWidth = 1;
		renderer.strokeLine(VIEW_W * 0.22, 252, VIEW_W * 0.78, 252);
		renderer.strokeLine(VIEW_W * 0.22, 404, VIEW_W * 0.78, 404);
		renderer.setColor(
			failure ? rgba(255, 95, 95, 0.15) : rgba(255, 218, 143, 0.12),
		);
		renderer.lineWidth = 28;
		renderer.strokeRect(18, 18, VIEW_W - 36, VIEW_H - 36);
	}
}
