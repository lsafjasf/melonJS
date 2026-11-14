/**
 * melonJS — Ice Core Survey: procedural textures.
 *
 * The shelf, its water leads, the camp and the three drill pads are painted
 * once into a single world-sized canvas. Everything that moves after that is
 * drawn by renderables, so the static art stays one texture upload.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import type { IcePatch, WorldData } from "./terrain";
import { MAP_HEIGHT, MAP_WIDTH, SEED } from "./terrain";

function mulberry32(seed: number) {
	let value = seed >>> 0;
	return () => {
		value += 0x6d2b79f5;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function traceBlob(ctx: CanvasRenderingContext2D, patch: IcePatch) {
	const count = patch.shape.length;
	ctx.beginPath();
	for (let i = 0; i < count; i++) {
		const angle = (i / count) * Math.PI * 2;
		const radius = patch.shape[i];
		const x =
			patch.x +
			Math.cos(angle) * patch.rx * radius * Math.cos(patch.rotation) -
			Math.sin(angle) * patch.ry * radius * Math.sin(patch.rotation);
		const y =
			patch.y +
			Math.cos(angle) * patch.rx * radius * Math.sin(patch.rotation) +
			Math.sin(angle) * patch.ry * radius * Math.cos(patch.rotation);
		if (i === 0) {
			ctx.moveTo(x, y);
		} else {
			ctx.lineTo(x, y);
		}
	}
	ctx.closePath();
}

function drawCrack(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	angle: number,
	length: number,
	width: number,
	depth: number,
	rng: () => number,
	alpha: number,
) {
	let px = x;
	let py = y;
	let direction = angle;
	const steps = 3 + Math.floor(rng() * 4);
	const points: [number, number][] = [[px, py]];
	for (let i = 0; i < steps; i++) {
		direction += (rng() - 0.5) * 0.55;
		const step = (length / steps) * (0.65 + rng() * 0.7);
		px += Math.cos(direction) * step;
		py += Math.sin(direction) * step;
		points.push([px, py]);
	}

	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.strokeStyle = "rgba(30, 72, 82, 0.62)";
	ctx.lineWidth = width + 1.8;
	ctx.beginPath();
	ctx.moveTo(points[0][0], points[0][1]);
	for (let i = 1; i < points.length; i++) {
		ctx.lineTo(points[i][0], points[i][1]);
	}
	ctx.stroke();
	ctx.strokeStyle = "rgba(226, 247, 249, 0.66)";
	ctx.lineWidth = Math.max(0.7, width * 0.46);
	ctx.stroke();

	if (depth > 0) {
		for (let i = 1; i < points.length - 1; i++) {
			if (rng() > 0.52) {
				drawCrack(
					ctx,
					points[i][0],
					points[i][1],
					direction + (rng() < 0.5 ? -1 : 1) * (0.45 + rng() * 0.65),
					length * (0.22 + rng() * 0.3),
					Math.max(0.6, width * 0.52),
					depth - 1,
					rng,
					alpha * 0.76,
				);
			}
		}
	}
	ctx.restore();
}

function drawWater(ctx: CanvasRenderingContext2D, patch: IcePatch) {
	traceBlob(ctx, patch);
	ctx.save();
	ctx.shadowColor = "rgba(6, 34, 45, 0.55)";
	ctx.shadowBlur = 26;
	const water = ctx.createRadialGradient(
		patch.x - patch.rx * 0.2,
		patch.y - patch.ry * 0.25,
		12,
		patch.x,
		patch.y,
		Math.max(patch.rx, patch.ry),
	);
	water.addColorStop(0, "rgba(8, 28, 37, 0.96)");
	water.addColorStop(0.55, "rgba(14, 49, 61, 0.94)");
	water.addColorStop(1, "rgba(29, 88, 98, 0.9)");
	ctx.fillStyle = water;
	ctx.fill();
	ctx.restore();

	traceBlob(ctx, patch);
	ctx.strokeStyle = "rgba(205, 242, 243, 0.8)";
	ctx.lineWidth = 2.6;
	ctx.stroke();
	ctx.strokeStyle = "rgba(92, 163, 172, 0.7)";
	ctx.lineWidth = 9;
	ctx.stroke();

	// A couple of loose floes keep the lead from reading as a flat hole.
	ctx.save();
	traceBlob(ctx, patch);
	ctx.clip();
	ctx.fillStyle = "rgba(188, 224, 226, 0.22)";
	for (let i = 0; i < 4; i++) {
		const fx = patch.x + (Math.sin(i * 4.2) * patch.rx) / 2;
		const fy = patch.y + (Math.cos(i * 3.7) * patch.ry) / 2;
		ctx.beginPath();
		ctx.ellipse(
			fx,
			fy,
			12 + i * 4,
			6 + i * 2,
			patch.rotation + i,
			0,
			Math.PI * 2,
		);
		ctx.fill();
	}
	ctx.restore();
}

function drawThinIce(ctx: CanvasRenderingContext2D, patch: IcePatch) {
	traceBlob(ctx, patch);
	ctx.save();
	ctx.shadowColor = "rgba(218, 248, 248, 0.34)";
	ctx.shadowBlur = 18;
	const glass = ctx.createRadialGradient(
		patch.x,
		patch.y,
		4,
		patch.x,
		patch.y,
		Math.max(patch.rx, patch.ry),
	);
	glass.addColorStop(0, "rgba(206, 243, 245, 0.46)");
	glass.addColorStop(0.55, "rgba(145, 206, 214, 0.34)");
	glass.addColorStop(1, "rgba(114, 183, 194, 0.08)");
	ctx.fillStyle = glass;
	ctx.fill();
	ctx.strokeStyle = "rgba(231, 251, 252, 0.62)";
	ctx.lineWidth = 2;
	ctx.stroke();
	ctx.restore();

	ctx.save();
	traceBlob(ctx, patch);
	ctx.clip();
	ctx.strokeStyle = "rgba(70, 131, 142, 0.32)";
	ctx.lineWidth = 1.3;
	for (let i = -2; i <= 2; i++) {
		ctx.beginPath();
		ctx.ellipse(
			patch.x + i * 17,
			patch.y + i * 5,
			patch.rx * 0.72,
			patch.ry * 0.52,
			patch.rotation,
			0,
			Math.PI * 2,
		);
		ctx.stroke();
	}
	ctx.restore();
}

function drawCamp(ctx: CanvasRenderingContext2D, world: WorldData) {
	const { camp } = world;
	ctx.save();
	const halo = ctx.createRadialGradient(
		camp.x,
		camp.y,
		18,
		camp.x,
		camp.y,
		camp.radius * 1.8,
	);
	halo.addColorStop(0, "rgba(255, 196, 85, 0.4)");
	halo.addColorStop(0.55, "rgba(255, 181, 72, 0.14)");
	halo.addColorStop(1, "rgba(255, 181, 72, 0)");
	ctx.fillStyle = halo;
	ctx.fillRect(
		camp.x - camp.radius * 2,
		camp.y - camp.radius * 2,
		camp.radius * 4,
		camp.radius * 4,
	);

	ctx.strokeStyle = "rgba(255, 203, 105, 0.86)";
	ctx.lineWidth = 8;
	ctx.beginPath();
	ctx.arc(camp.x, camp.y, camp.radius, 0, Math.PI * 2);
	ctx.stroke();
	ctx.strokeStyle = "rgba(255, 229, 175, 0.5)";
	ctx.lineWidth = 2;
	ctx.setLineDash([7, 10]);
	ctx.beginPath();
	ctx.arc(camp.x, camp.y, camp.radius - 14, 0, Math.PI * 2);
	ctx.stroke();
	ctx.setLineDash([]);

	ctx.fillStyle = "rgba(26, 46, 52, 0.94)";
	ctx.beginPath();
	ctx.arc(camp.x, camp.y, 49, 0, Math.PI * 2);
	ctx.fill();
	ctx.strokeStyle = "rgba(255, 208, 118, 0.92)";
	ctx.lineWidth = 3;
	ctx.stroke();

	// A compact polar station: two insulated huts, an antenna and a beacon.
	ctx.fillStyle = "#d8a64e";
	ctx.fillRect(camp.x - 30, camp.y - 12, 27, 27);
	ctx.fillStyle = "#f2d28f";
	ctx.fillRect(camp.x - 27, camp.y - 9, 9, 18);
	ctx.fillStyle = "#b88236";
	ctx.fillRect(camp.x + 2, camp.y - 6, 23, 22);
	ctx.strokeStyle = "#f7e4b5";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(camp.x + 5, camp.y - 6);
	ctx.lineTo(camp.x + 13, camp.y + 16);
	ctx.lineTo(camp.x + 22, camp.y - 6);
	ctx.stroke();
	ctx.beginPath();
	ctx.moveTo(camp.x + 28, camp.y - 8);
	ctx.lineTo(camp.x + 28, camp.y - 43);
	ctx.stroke();
	ctx.fillStyle = "#ff6b4d";
	ctx.beginPath();
	ctx.arc(camp.x + 28, camp.y - 44, 4.5, 0, Math.PI * 2);
	ctx.fill();

	ctx.fillStyle = "rgba(255, 220, 150, 0.85)";
	ctx.font = "700 17px sans-serif";
	ctx.textAlign = "center";
	ctx.fillText("CAMP / RTB", camp.x, camp.y + camp.radius + 24);
	ctx.restore();
}

function drawCorePads(ctx: CanvasRenderingContext2D, world: WorldData) {
	for (const core of world.cores) {
		ctx.save();
		const halo = ctx.createRadialGradient(
			core.x,
			core.y,
			8,
			core.x,
			core.y,
			core.radius * 2.1,
		);
		halo.addColorStop(0, "rgba(239, 185, 79, 0.29)");
		halo.addColorStop(0.55, "rgba(239, 185, 79, 0.1)");
		halo.addColorStop(1, "rgba(239, 185, 79, 0)");
		ctx.fillStyle = halo;
		ctx.fillRect(
			core.x - core.radius * 2.2,
			core.y - core.radius * 2.2,
			core.radius * 4.4,
			core.radius * 4.4,
		);
		ctx.fillStyle = "rgba(24, 43, 48, 0.93)";
		ctx.beginPath();
		ctx.arc(core.x, core.y, 35, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = "rgba(255, 205, 111, 0.85)";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.strokeStyle = "rgba(255, 217, 142, 0.38)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(core.x - 24, core.y);
		ctx.lineTo(core.x + 24, core.y);
		ctx.moveTo(core.x, core.y - 24);
		ctx.lineTo(core.x, core.y + 24);
		ctx.stroke();
		ctx.fillStyle = "rgba(255, 208, 120, 0.88)";
		ctx.font = "700 15px sans-serif";
		ctx.textAlign = "center";
		ctx.fillText(`CORE ${core.id}`, core.x, core.y + core.radius + 20);
		ctx.restore();
	}
}

/** Paint the static ice shelf. */
export function bakeIceField(world: WorldData): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = MAP_WIDTH;
	canvas.height = MAP_HEIGHT;
	const ctx = canvas.getContext("2d");
	if (ctx === null) {
		return canvas;
	}
	const rng = mulberry32(SEED ^ 0xa5f15eed);

	const base = ctx.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT);
	base.addColorStop(0, "#9fc7cd");
	base.addColorStop(0.45, "#c7e1e3");
	base.addColorStop(1, "#e1edef");
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

	// Broad wind-scoured fields, then fine wind streaks. These are deliberately
	// low contrast: the cracks and track marks have to stay legible on top.
	for (let i = 0; i < 72; i++) {
		const x = rng() * MAP_WIDTH;
		const y = rng() * MAP_HEIGHT;
		const r = 80 + rng() * 300;
		const patch = ctx.createRadialGradient(x, y, 3, x, y, r);
		const cool = rng() < 0.5;
		patch.addColorStop(
			0,
			cool ? "rgba(105, 165, 177, 0.15)" : "rgba(255, 255, 255, 0.22)",
		);
		patch.addColorStop(1, "rgba(255, 255, 255, 0)");
		ctx.fillStyle = patch;
		ctx.fillRect(x - r, y - r, r * 2, r * 2);
	}
	ctx.save();
	ctx.lineCap = "round";
	for (let i = 0; i < 540; i++) {
		const x = rng() * MAP_WIDTH;
		const y = rng() * MAP_HEIGHT;
		const length = 24 + rng() * 150;
		ctx.strokeStyle = `rgba(255, 255, 255, ${0.018 + rng() * 0.055})`;
		ctx.lineWidth = 1 + rng() * 7;
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.lineTo(x + length, y + length * 0.13 * (rng() - 0.15));
		ctx.stroke();
	}
	ctx.restore();

	// Static fractures. They are texture, not a mechanic; the live crack field
	// draws the cracks the vehicle is actually responsible for.
	for (let i = 0; i < 92; i++) {
		drawCrack(
			ctx,
			rng() * MAP_WIDTH,
			rng() * MAP_HEIGHT,
			rng() * Math.PI * 2,
			46 + rng() * 220,
			1.1 + rng() * 2.1,
			3,
			rng,
			0.24 + rng() * 0.28,
		);
	}

	for (const patch of world.thinIce) {
		drawThinIce(ctx, patch);
	}
	for (const patch of world.water) {
		drawWater(ctx, patch);
	}

	drawCamp(ctx, world);
	drawCorePads(ctx, world);

	// Drift banks and a little granular snow on top.
	for (let i = 0; i < 200; i++) {
		const x = rng() * MAP_WIDTH;
		const y = rng() * MAP_HEIGHT;
		const r = 20 + rng() * 85;
		const drift = ctx.createRadialGradient(x, y, 1, x, y, r);
		drift.addColorStop(0, "rgba(255, 255, 255, 0.22)");
		drift.addColorStop(1, "rgba(255, 255, 255, 0)");
		ctx.fillStyle = drift;
		ctx.fillRect(x - r, y - r * 0.58, r * 2, r * 1.16);
	}
	for (let i = 0; i < 2600; i++) {
		ctx.fillStyle = `rgba(255, 255, 255, ${0.12 + rng() * 0.4})`;
		const size = rng() < 0.08 ? 2 : 1;
		ctx.fillRect(rng() * MAP_WIDTH, rng() * MAP_HEIGHT, size, size);
	}

	// The outside of the surveyed shelf fades into whiteout.
	const edge = ctx.createRadialGradient(
		MAP_WIDTH / 2,
		MAP_HEIGHT / 2,
		Math.min(MAP_WIDTH, MAP_HEIGHT) * 0.34,
		MAP_WIDTH / 2,
		MAP_HEIGHT / 2,
		Math.max(MAP_WIDTH, MAP_HEIGHT) * 0.68,
	);
	edge.addColorStop(0, "rgba(239, 249, 250, 0)");
	edge.addColorStop(1, "rgba(239, 249, 250, 0.87)");
	ctx.fillStyle = edge;
	ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

	return canvas;
}

/** Soft dot used by snow and spray emitters. */
export function makeSoftParticle(
	size = 24,
	inner = "rgba(255,255,255,0.95)",
	outer = "rgba(255,255,255,0)",
): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext("2d");
	if (ctx !== null) {
		const half = size / 2;
		const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
		gradient.addColorStop(0, inner);
		gradient.addColorStop(0.35, inner);
		gradient.addColorStop(1, outer);
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, size, size);
	}
	return canvas;
}

/** A slightly harder cyan chip, for water and ice impacts. */
export function makeSplashChip(): HTMLCanvasElement {
	const canvas = document.createElement("canvas");
	canvas.width = 12;
	canvas.height = 12;
	const ctx = canvas.getContext("2d");
	if (ctx !== null) {
		ctx.fillStyle = "rgba(211, 249, 252, 0.95)";
		ctx.beginPath();
		ctx.moveTo(6, 0);
		ctx.lineTo(11, 7);
		ctx.lineTo(5, 12);
		ctx.lineTo(1, 6);
		ctx.closePath();
		ctx.fill();
	}
	return canvas;
}
