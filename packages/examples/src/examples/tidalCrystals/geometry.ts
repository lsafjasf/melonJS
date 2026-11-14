/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { cross, dot, normalize, sub, type Vec3 } from "./math";

export const CRYSTAL_BASE_Y = -2.85;
export const TIDE_MIN = 0;
export const TIDE_MAX = 1;
export const WATER_LOW = -1.58;
export const WATER_HIGH = 2.36;

export const waterLevelForTide = (tide: number): number =>
	WATER_LOW + (WATER_HIGH - WATER_LOW) * tide;

interface CrystalConfig {
	x: number;
	z: number;
	height: number;
	radius: number;
	sides: number;
	rotation: number;
	leanX: number;
	leanZ: number;
	color: Vec3;
}

const mulberry32 = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
};

const tint = (r: number, g: number, b: number): Vec3 => [r, g, b];

const crystalConfigs: CrystalConfig[] = [
	{
		x: -6.8,
		z: 0.8,
		height: 4.2,
		radius: 0.9,
		sides: 6,
		rotation: 0.2,
		leanX: 0.05,
		leanZ: -0.14,
		color: tint(0.32, 0.84, 0.8),
	},
	{
		x: -4.75,
		z: -0.7,
		height: 5.55,
		radius: 0.66,
		sides: 5,
		rotation: 0.65,
		leanX: -0.1,
		leanZ: -0.06,
		color: tint(0.46, 0.73, 0.96),
	},
	{
		x: -2.9,
		z: 0.35,
		height: 3.45,
		radius: 0.78,
		sides: 7,
		rotation: -0.3,
		leanX: 0.14,
		leanZ: 0.06,
		color: tint(0.55, 0.9, 0.72),
	},
	{
		x: -1.05,
		z: -0.28,
		height: 6.15,
		radius: 1.02,
		sides: 6,
		rotation: 1.05,
		leanX: 0.08,
		leanZ: 0.1,
		color: tint(0.38, 0.93, 0.95),
	},
	{
		x: 1.15,
		z: 0.95,
		height: 4.6,
		radius: 0.83,
		sides: 6,
		rotation: 0.45,
		leanX: -0.18,
		leanZ: -0.12,
		color: tint(0.66, 0.82, 1),
	},
	{
		x: 3.05,
		z: -0.55,
		height: 6.55,
		radius: 1.08,
		sides: 8,
		rotation: -0.4,
		leanX: 0.06,
		leanZ: 0.04,
		color: tint(0.45, 0.95, 0.85),
	},
	{
		x: 5.05,
		z: 0.45,
		height: 5,
		radius: 0.7,
		sides: 5,
		rotation: 1.25,
		leanX: -0.15,
		leanZ: -0.08,
		color: tint(0.7, 0.75, 1),
	},
	{
		x: 6.9,
		z: -0.35,
		height: 3.9,
		radius: 0.86,
		sides: 7,
		rotation: 0.1,
		leanX: 0.18,
		leanZ: 0.12,
		color: tint(0.35, 0.8, 0.93),
	},
];

const shardConfigs: CrystalConfig[] = [];
const random = mulberry32(0x71a4c2);
const shardTints = [
	tint(0.46, 0.78, 0.95),
	tint(0.38, 0.9, 0.86),
	tint(0.64, 0.8, 1),
];

for (let parent = 0; parent < crystalConfigs.length; parent++) {
	const source = crystalConfigs[parent];
	for (let shard = 0; shard < 2; shard++) {
		const angle = random() * Math.PI * 2;
		const distance = source.radius * (1.25 + random() * 0.75);
		const height = 0.8 + random() * 1.25;
		shardConfigs.push({
			x: source.x + Math.cos(angle) * distance,
			z: source.z + Math.sin(angle) * distance,
			height,
			radius: 0.16 + random() * 0.18,
			sides: 4 + Math.floor(random() * 3),
			rotation: random() * Math.PI,
			leanX: Math.cos(angle) * 0.16,
			leanZ: Math.sin(angle) * 0.16,
			color: shardTints[(parent + shard) % shardTints.length],
		});
	}
}

const allCrystals = [...crystalConfigs, ...shardConfigs];

interface MeshBuilder {
	vertices: number[];
	vertex: (position: Vec3, normal: Vec3, color: Vec3, seed: number) => void;
	triangle: (
		a: Vec3,
		b: Vec3,
		c: Vec3,
		color: Vec3,
		seed: number,
		outward?: Vec3,
	) => void;
}

const makeBuilder = (): MeshBuilder => {
	const vertices: number[] = [];
	const vertex = (position: Vec3, normal: Vec3, color: Vec3, seed: number) => {
		vertices.push(
			position[0],
			position[1],
			position[2],
			normal[0],
			normal[1],
			normal[2],
			color[0],
			color[1],
			color[2],
			seed,
		);
	};
	const triangle = (
		a: Vec3,
		b: Vec3,
		c: Vec3,
		color: Vec3,
		seed: number,
		outward?: Vec3,
	) => {
		let normal = normalize(cross(sub(b, a), sub(c, a)));
		if (outward && dot(normal, outward) < 0) {
			normal = [-normal[0], -normal[1], -normal[2]];
		}
		vertex(a, normal, color, seed);
		vertex(b, normal, color, seed);
		vertex(c, normal, color, seed);
	};
	return { vertices, vertex, triangle };
};

const ringPoint = (
	config: CrystalConfig,
	y: number,
	radius: number,
	angle: number,
): Vec3 => {
	const progress = (y - CRYSTAL_BASE_Y) / config.height;
	return [
		config.x + Math.cos(angle) * radius + config.leanX * progress,
		y,
		config.z + Math.sin(angle) * radius + config.leanZ * progress,
	];
};

const addCrystal = (
	builder: MeshBuilder,
	config: CrystalConfig,
	seed: number,
) => {
	const rings = [
		{ y: CRYSTAL_BASE_Y, radius: config.radius * 1.02 },
		{ y: CRYSTAL_BASE_Y + config.height * 0.58, radius: config.radius * 1.1 },
		{ y: CRYSTAL_BASE_Y + config.height * 0.86, radius: config.radius * 0.57 },
	];
	const top = ringPoint(
		config,
		CRYSTAL_BASE_Y + config.height,
		0,
		config.rotation,
	);
	const hue = config.color;

	for (let ring = 0; ring < rings.length - 1; ring++) {
		for (let side = 0; side < config.sides; side++) {
			const angleA = config.rotation + (side / config.sides) * Math.PI * 2;
			const angleB =
				config.rotation + ((side + 1) / config.sides) * Math.PI * 2;
			const lowerA = ringPoint(
				config,
				rings[ring].y,
				rings[ring].radius,
				angleA,
			);
			const lowerB = ringPoint(
				config,
				rings[ring].y,
				rings[ring].radius,
				angleB,
			);
			const upperA = ringPoint(
				config,
				rings[ring + 1].y,
				rings[ring + 1].radius,
				angleA,
			);
			const upperB = ringPoint(
				config,
				rings[ring + 1].y,
				rings[ring + 1].radius,
				angleB,
			);
			const centerAngle = (angleA + angleB) / 2;
			const outward: Vec3 = [
				Math.cos(centerAngle),
				0.12,
				Math.sin(centerAngle),
			];
			const facetHue: Vec3 = [
				hue[0] * (0.93 + 0.08 * Math.sin(side * 2.1 + seed)),
				hue[1] * (0.94 + 0.06 * Math.cos(side * 1.7 + seed)),
				hue[2] * (0.95 + 0.07 * Math.sin(side * 1.3 + seed)),
			];
			builder.triangle(lowerA, lowerB, upperB, facetHue, seed, outward);
			builder.triangle(lowerA, upperB, upperA, facetHue, seed, outward);
		}
	}

	const last = rings[rings.length - 1];
	for (let side = 0; side < config.sides; side++) {
		const angleA = config.rotation + (side / config.sides) * Math.PI * 2;
		const angleB = config.rotation + ((side + 1) / config.sides) * Math.PI * 2;
		const ringA = ringPoint(config, last.y, last.radius, angleA);
		const ringB = ringPoint(config, last.y, last.radius, angleB);
		const centerAngle = (angleA + angleB) / 2;
		const outward: Vec3 = [Math.cos(centerAngle), 0.55, Math.sin(centerAngle)];
		builder.triangle(ringA, ringB, top, hue, seed, outward);
	}
};

export const createCrystalGeometry = (): Float32Array => {
	const builder = makeBuilder();
	let seed = 0.15;
	for (const crystal of allCrystals) {
		addCrystal(builder, crystal, seed);
		seed += 1.37;
	}
	return new Float32Array(builder.vertices);
};

export const createWaterGeometry = (
	columns = 176,
	rows = 132,
): { vertices: Float32Array; indices: Uint32Array } => {
	const vertices: number[] = [];
	const indices: number[] = [];
	for (let row = 0; row <= rows; row++) {
		const z = -24 + (row / rows) * 42;
		for (let column = 0; column <= columns; column++) {
			const x = -26 + (column / columns) * 52;
			vertices.push(x, z);
		}
	}
	for (let row = 0; row < rows; row++) {
		for (let column = 0; column < columns; column++) {
			const a = row * (columns + 1) + column;
			const b = a + 1;
			const c = a + columns + 1;
			const d = c + 1;
			indices.push(a, c, b, b, c, d);
		}
	}
	return {
		vertices: new Float32Array(vertices),
		indices: new Uint32Array(indices),
	};
};
