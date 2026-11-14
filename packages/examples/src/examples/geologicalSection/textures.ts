/**
 * Procedural Canvas 2D rock textures — no images are loaded anywhere in the
 * example. Each rock type gets a small tile painted from a seed-derived PRNG
 * and repeated across the layer body. Grain, fractures and caves are drawn
 * differently per rock type so contacts read visually as well as by colour.
 */
import { hashSeed, mulberry32, nextBetween } from "./rng";
import type { RockType } from "./types";

const TILE = 128;

const shade = (hex: string, amount: number): string => {
	const value = Number.parseInt(hex.slice(1), 16);
	const clamp = (channel: number) =>
		Math.max(0, Math.min(255, Math.round(channel + amount)));
	const r = clamp((value >> 16) & 255);
	const g = clamp((value >> 8) & 255);
	const b = clamp(value & 255);
	return `rgb(${r},${g},${b})`;
};

/** Scattered mineral grains — the base texture shared by every rock. */
const paintGrain = (
	ctx: CanvasRenderingContext2D,
	random: () => number,
	base: string,
	fine: boolean,
): void => {
	ctx.fillStyle = base;
	ctx.fillRect(0, 0, TILE, TILE);
	const count = fine ? 900 : 500;
	for (let i = 0; i < count; i++) {
		const x = random() * TILE;
		const y = random() * TILE;
		const radius = fine ? random() * 1.1 + 0.2 : random() * 2.2 + 0.4;
		ctx.globalAlpha = 0.12 + random() * 0.25;
		ctx.fillStyle = shade(base, random() > 0.5 ? 40 : -42);
		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
};

/** Jagged polyline fractures, typical of brittle limestone/shale. */
const paintFractures = (
	ctx: CanvasRenderingContext2D,
	random: () => number,
	base: string,
	count: number,
): void => {
	ctx.strokeStyle = shade(base, -70);
	ctx.lineWidth = 1;
	for (let f = 0; f < count; f++) {
		let x = random() * TILE;
		let y = random() * TILE;
		ctx.globalAlpha = 0.25 + random() * 0.3;
		ctx.beginPath();
		ctx.moveTo(x, y);
		const segments = 3 + Math.floor(random() * 4);
		for (let s = 0; s < segments; s++) {
			x += nextBetween(random, -14, 14);
			y += nextBetween(random, 6, 18);
			ctx.lineTo(x, y);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
};

/** Rounded solution caves, typical of limestone and dolomite. */
const paintCaves = (
	ctx: CanvasRenderingContext2D,
	random: () => number,
	base: string,
	count: number,
): void => {
	for (let c = 0; c < count; c++) {
		const x = random() * TILE;
		const y = random() * TILE;
		const radius = nextBetween(random, 4, 11);
		const gradient = ctx.createRadialGradient(
			x - radius * 0.3,
			y - radius * 0.3,
			radius * 0.1,
			x,
			y,
			radius,
		);
		gradient.addColorStop(0, shade(base, -95));
		gradient.addColorStop(0.7, shade(base, -60));
		gradient.addColorStop(1, "rgba(0,0,0,0)");
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.ellipse(x, y, radius, radius * 0.7, random() * Math.PI, 0, Math.PI * 2);
		ctx.fill();
	}
};

/** Horizontal bedding laminae for fine-grained clastic rocks. */
const paintBedding = (
	ctx: CanvasRenderingContext2D,
	random: () => number,
	base: string,
): void => {
	ctx.strokeStyle = shade(base, -35);
	for (let y = 4; y < TILE; y += 6 + random() * 7) {
		ctx.globalAlpha = 0.18 + random() * 0.2;
		ctx.lineWidth = 0.8 + random();
		ctx.beginPath();
		ctx.moveTo(0, y);
		for (let x = 0; x <= TILE; x += 12) {
			ctx.lineTo(x, y + Math.sin(x * 0.2 + random() * 3) * 1.6);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
};

/** Coarse rounded pebbles for conglomerate. */
const paintPebbles = (
	ctx: CanvasRenderingContext2D,
	random: () => number,
	base: string,
): void => {
	for (let i = 0; i < 26; i++) {
		const x = random() * TILE;
		const y = random() * TILE;
		const radius = nextBetween(random, 3, 7);
		ctx.globalAlpha = 0.5;
		ctx.fillStyle = shade(base, nextBetween(random, -30, 35));
		ctx.beginPath();
		ctx.ellipse(x, y, radius, radius * 0.8, random() * Math.PI, 0, Math.PI * 2);
		ctx.fill();
		ctx.globalAlpha = 0.35;
		ctx.strokeStyle = shade(base, -55);
		ctx.lineWidth = 0.8;
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
};

const cache = new Map<string, HTMLCanvasElement>();

/**
 * Get (or build and cache) the repeating texture tile for a rock type.
 * The tile is keyed by seed + layer index so two layers of the same rock
 * still show different grain.
 */
export const getRockTexture = (
	seed: string,
	layerIndex: number,
	rockType: RockType,
	baseColor: string,
): HTMLCanvasElement => {
	const key = `${seed}:${layerIndex}:${rockType}`;
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}
	const canvas = document.createElement("canvas");
	canvas.width = TILE;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		return canvas;
	}
	const random = mulberry32(hashSeed(key));

	switch (rockType) {
		case "conglomerate":
			paintGrain(ctx, random, baseColor, false);
			paintPebbles(ctx, random, baseColor);
			break;
		case "sandstone":
			paintGrain(ctx, random, baseColor, true);
			paintBedding(ctx, random, baseColor);
			break;
		case "siltstone":
			paintGrain(ctx, random, baseColor, true);
			paintBedding(ctx, random, baseColor);
			paintFractures(ctx, random, baseColor, 3);
			break;
		case "shale":
			paintGrain(ctx, random, baseColor, true);
			paintBedding(ctx, random, baseColor);
			paintFractures(ctx, random, baseColor, 6);
			break;
		case "limestone":
			paintGrain(ctx, random, baseColor, true);
			paintFractures(ctx, random, baseColor, 5);
			paintCaves(ctx, random, baseColor, 4);
			break;
		case "mudstone":
			paintGrain(ctx, random, baseColor, true);
			paintBedding(ctx, random, baseColor);
			break;
		case "dolomite":
			paintGrain(ctx, random, baseColor, false);
			paintFractures(ctx, random, baseColor, 4);
			paintCaves(ctx, random, baseColor, 2);
			break;
	}

	cache.set(key, canvas);
	return canvas;
};

export const textureTileSize = TILE;
