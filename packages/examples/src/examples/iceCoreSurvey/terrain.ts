/**
 * melonJS — Ice Core Survey: fixed-seed ice field.
 *
 * The level is generated once from `SEED`, and every random choice goes through
 * the same mulberry32 stream. Water is rejected wherever it would close the
 * corridor connecting the camp to one of the three core sites, then a coarse
 * flood fill proves the corridor is still traversable before the game starts.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const SEED = 0x54c0de;
export const MAP_WIDTH = 2600;
export const MAP_HEIGHT = 1900;

export interface Point {
	x: number;
	y: number;
}

export interface CoreSite extends Point {
	id: "A" | "B" | "C";
	radius: number;
	route: Point[];
}

export interface IcePatch extends Point {
	rx: number;
	ry: number;
	rotation: number;
	shape: number[];
}

export interface WorldData {
	camp: Point & { radius: number };
	cores: CoreSite[];
	water: IcePatch[];
	thinIce: IcePatch[];
	routePass: boolean;
}

const CAMP = { x: 760, y: 1180, radius: 104 };

const CORES: CoreSite[] = [
	{
		id: "A",
		x: 430,
		y: 1610,
		radius: 84,
		route: [
			{ x: CAMP.x, y: CAMP.y },
			{ x: 600, y: 1325 },
			{ x: 470, y: 1470 },
			{ x: 430, y: 1610 },
		],
	},
	{
		id: "B",
		x: 2110,
		y: 1510,
		radius: 84,
		route: [
			{ x: CAMP.x, y: CAMP.y },
			{ x: 1040, y: 1360 },
			{ x: 1590, y: 1490 },
			{ x: 2110, y: 1510 },
		],
	},
	{
		id: "C",
		x: 1810,
		y: 430,
		radius: 84,
		route: [
			{ x: CAMP.x, y: CAMP.y },
			{ x: 980, y: 940 },
			{ x: 1300, y: 760 },
			{ x: 1640, y: 520 },
			{ x: 1810, y: 430 },
		],
	},
];

const ROUTE_CLEARANCE = 104;

/** Small deterministic PRNG. */
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

/** A reusable irregular outline, normalized around zero. */
function makeShape(rng: () => number, count = 22) {
	const shape: number[] = [];
	for (let i = 0; i < count; i++) {
		shape.push(0.78 + rng() * 0.34);
	}
	return shape;
}

function pointAlongSegment(
	p: Point,
	a: Point,
	b: Point,
): { distance: number; t: number } {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const lengthSq = vx * vx + vy * vy;
	if (lengthSq === 0) {
		return { distance: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
	}
	const t = Math.max(
		0,
		Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq),
	);
	return {
		distance: Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)),
		t,
	};
}

function distanceToRoute(point: Point, route: Point[]) {
	let distance = Number.POSITIVE_INFINITY;
	for (let i = 0; i < route.length - 1; i++) {
		distance = Math.min(
			distance,
			pointAlongSegment(point, route[i], route[i + 1]).distance,
		);
	}
	return distance;
}

function distanceToAnyRoute(point: Point) {
	let distance = Number.POSITIVE_INFINITY;
	for (const core of CORES) {
		distance = Math.min(distance, distanceToRoute(point, core.route));
	}
	return distance;
}

/** Whether a point sits on the outside of one of the irregular water blobs. */
export function inWater(world: WorldData, x: number, y: number) {
	for (const patch of world.water) {
		const dx = x - patch.x;
		const dy = y - patch.y;
		const c = Math.cos(-patch.rotation);
		const s = Math.sin(-patch.rotation);
		const lx = dx * c - dy * s;
		const ly = dx * s + dy * c;
		const angle = Math.atan2(ly / patch.ry, lx / patch.rx);
		const ring =
			Math.floor(((angle + Math.PI) / (Math.PI * 2)) * patch.shape.length) %
			patch.shape.length;
		const radius = patch.shape[ring];
		if ((lx / (patch.rx * radius)) ** 2 + (ly / (patch.ry * radius)) ** 2 < 1) {
			return true;
		}
	}
	return false;
}

/** Thin ice is traversable, but it amplifies every input on the stress model. */
export function inThinIce(world: WorldData, x: number, y: number) {
	for (const patch of world.thinIce) {
		const dx = x - patch.x;
		const dy = y - patch.y;
		const c = Math.cos(-patch.rotation);
		const s = Math.sin(-patch.rotation);
		const lx = dx * c - dy * s;
		const ly = dx * s + dy * c;
		if ((lx / patch.rx) ** 2 + (ly / patch.ry) ** 2 < 1) {
			return true;
		}
	}
	return false;
}

/**
 * Coarse flood fill over the generated water. Thin ice is traversable, so a
 * pass means the player can reach every core and come home.
 */
function validateRoutes(world: WorldData) {
	const cell = 32;
	const cols = Math.ceil(MAP_WIDTH / cell);
	const rows = Math.ceil(MAP_HEIGHT / cell);
	const blocked = new Uint8Array(cols * rows);
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < cols; col++) {
			if (inWater(world, (col + 0.5) * cell, (row + 0.5) * cell)) {
				blocked[row * cols + col] = 1;
			}
		}
	}
	const queue: number[] = [];
	const seen = new Uint8Array(cols * rows);
	const startCol = Math.floor(world.camp.x / cell);
	const startRow = Math.floor(world.camp.y / cell);
	const start = startRow * cols + startCol;
	queue.push(start);
	seen[start] = 1;
	for (let head = 0; head < queue.length; head++) {
		const index = queue[head];
		const col = index % cols;
		const row = Math.floor(index / cols);
		for (const [dc, dr] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		]) {
			const nc = col + dc;
			const nr = row + dr;
			if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) {
				continue;
			}
			const next = nr * cols + nc;
			if (blocked[next] === 0 && seen[next] === 0) {
				seen[next] = 1;
				queue.push(next);
			}
		}
	}
	return world.cores.every((core) => {
		return (
			seen[Math.floor(core.y / cell) * cols + Math.floor(core.x / cell)] === 1
		);
	});
}

/** Build the one world this example will ever use. */
export function createWorld(): WorldData {
	const rng = mulberry32(SEED);
	const world: WorldData = {
		camp: CAMP,
		cores: CORES,
		water: [],
		thinIce: [],
		routePass: false,
	};

	// Water is placed first, and never closer to a guaranteed corridor than
	// its own reach plus a vehicle-width margin. A rejected draw does not
	// consume an attempt, so the map is dense without ever touching a route.
	let attempts = 0;
	while (world.water.length < 18 && attempts < 260) {
		attempts++;
		const x = 180 + rng() * (MAP_WIDTH - 360);
		const y = 160 + rng() * (MAP_HEIGHT - 320);
		const rx = 105 + rng() * 210;
		const ry = 80 + rng() * 150;
		const rotation = rng() * Math.PI;
		const reach = Math.max(rx, ry) * 1.16 + ROUTE_CLEARANCE;
		if (distanceToAnyRoute({ x, y }) < reach) {
			continue;
		}
		if (Math.hypot(x - CAMP.x, y - CAMP.y) < CAMP.radius + reach * 0.55) {
			continue;
		}
		if (
			CORES.some((core) => {
				return Math.hypot(x - core.x, y - core.y) < core.radius + reach * 0.6;
			})
		) {
			continue;
		}
		if (
			world.water.some((patch) => {
				return (
					Math.hypot(x - patch.x, y - patch.y) <
					Math.max(rx, ry) + Math.max(patch.rx, patch.ry) + 42
				);
			})
		) {
			continue;
		}
		world.water.push({ x, y, rx, ry, rotation, shape: makeShape(rng, 24) });
	}

	// Thin ice is sprinkled around the corridors too. It is safe to cross,
	// which is what makes it a shortcut rather than an invisible wall.
	for (let i = 0; i < 24; i++) {
		const x = 170 + rng() * (MAP_WIDTH - 340);
		const y = 140 + rng() * (MAP_HEIGHT - 280);
		if (Math.hypot(x - CAMP.x, y - CAMP.y) < 235) {
			continue;
		}
		if (inWater(world, x, y)) {
			continue;
		}
		world.thinIce.push({
			x,
			y,
			rx: 70 + rng() * 120,
			ry: 50 + rng() * 90,
			rotation: rng() * Math.PI,
			shape: makeShape(rng, 16),
		});
	}

	world.routePass = validateRoutes(world);
	return world;
}

/** A calm fallback used by the renderer if a hand-tuned change closes a route. */
export function formatSeed() {
	return SEED.toString(16).toUpperCase().padStart(6, "0");
}
