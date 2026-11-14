/**
 * melonJS — seeded estuary generation and route validation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1500;
export const NAV_CELL = 20;

export interface Point {
	x: number;
	y: number;
}

export interface Sandbar {
	x: number;
	y: number;
	rx: number;
	ry: number;
	phase: number;
}

export interface Driftwood {
	x: number;
	y: number;
	length: number;
	angle: number;
}

export interface DropZone extends Point {
	index: number;
	radius: number;
	name: string;
}

export interface RouteCheck {
	from: string;
	to: string;
	ok: boolean;
	length: number;
}

export interface EstuaryMap {
	seed: number;
	topShore: number[];
	bottomShore: number[];
	sandbars: Sandbar[];
	driftwood: Driftwood[];
	zones: DropZone[];
	dock: Point;
	start: Point;
	dockRadius: number;
	corridors: Point[][];
	routes: RouteCheck[];
}

const SHORE_STEP = 120;
const SHORE_POINTS = WORLD_WIDTH / SHORE_STEP + 1;
const ZONE_NAMES = ["North Reach", "Lantern Bar", "Old Piles", "South Bay"];
const ROUTE_CLEARANCE = 46;

export function mulberry32(seed: number): () => number {
	let value = seed >>> 0;
	return () => {
		value += 0x6d2b79f5;
		let t = value;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shoreIndexAt(x: number): number {
	return Math.max(0, Math.min(SHORE_POINTS - 1, Math.round(x / SHORE_STEP)));
}

export function topShoreAt(map: EstuaryMap, x: number): number {
	const index = shoreIndexAt(x);
	const t = Math.max(0, Math.min(1, x / SHORE_STEP - index));
	const next = Math.min(SHORE_POINTS - 1, index + 1);
	return map.topShore[index] * (1 - t) + map.topShore[next] * t;
}

export function bottomShoreAt(map: EstuaryMap, x: number): number {
	const index = shoreIndexAt(x);
	const t = Math.max(0, Math.min(1, x / SHORE_STEP - index));
	const next = Math.min(SHORE_POINTS - 1, index + 1);
	return map.bottomShore[index] * (1 - t) + map.bottomShore[next] * t;
}

export function currentAt(x: number, y: number, timeSeconds: number): Point {
	const shear = Math.sin(y * 0.012 + timeSeconds * 0.34);
	const eddy = Math.cos(x * 0.0045 - timeSeconds * 0.22);
	return {
		x: 0.46 + 0.18 * shear + 0.05 * eddy,
		y: 0.08 + 0.34 * Math.sin(x * 0.0055 + timeSeconds * 0.19),
	};
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const lengthSq = dx * dx + dy * dy;
	if (lengthSq === 0) {
		return Math.hypot(point.x - a.x, point.y - a.y);
	}
	const t = Math.max(
		0,
		Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq),
	);
	return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function distanceToCorridors(point: Point, corridors: Point[][]): number {
	let best = Number.POSITIVE_INFINITY;
	for (const corridor of corridors) {
		for (let i = 1; i < corridor.length; i++) {
			best = Math.min(
				best,
				distanceToSegment(point, corridor[i - 1], corridor[i]),
			);
		}
	}
	return best;
}

function makeCorridor(
	start: Point,
	end: Point,
	random: () => number,
	bendScale = 0.22,
): Point[] {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const length = Math.hypot(dx, dy);
	const nx = -dy / Math.max(1, length);
	const ny = dx / Math.max(1, length);
	const bend = (random() * 2 - 1) * length * bendScale;
	const control = {
		x: (start.x + end.x) / 2 + nx * bend,
		y: (start.y + end.y) / 2 + ny * bend,
	};
	const points: Point[] = [];
	for (let i = 0; i <= 12; i++) {
		const t = i / 12;
		const u = 1 - t;
		points.push({
			x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
			y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
		});
	}
	return points;
}

class MinHeap {
	private readonly items: { index: number; score: number }[] = [];

	get size(): number {
		return this.items.length;
	}

	push(index: number, score: number): void {
		this.items.push({ index, score });
		let child = this.items.length - 1;
		while (child > 0) {
			const parent = Math.floor((child - 1) / 2);
			if (this.items[parent].score <= this.items[child].score) break;
			[this.items[parent], this.items[child]] = [
				this.items[child],
				this.items[parent],
			];
			child = parent;
		}
	}

	pop(): number | undefined {
		const root = this.items[0];
		const tail = this.items.pop();
		if (!root || !tail) return undefined;
		if (this.items.length > 0) {
			this.items[0] = tail;
			let parent = 0;
			while (true) {
				const left = parent * 2 + 1;
				const right = left + 1;
				let smallest = parent;
				if (
					left < this.items.length &&
					this.items[left].score < this.items[smallest].score
				) {
					smallest = left;
				}
				if (
					right < this.items.length &&
					this.items[right].score < this.items[smallest].score
				) {
					smallest = right;
				}
				if (smallest === parent) break;
				[this.items[parent], this.items[smallest]] = [
					this.items[smallest],
					this.items[parent],
				];
				parent = smallest;
			}
		}
		return root.index;
	}
}

class NavGrid {
	readonly cols = Math.ceil(WORLD_WIDTH / NAV_CELL);
	readonly rows = Math.ceil(WORLD_HEIGHT / NAV_CELL);
	private readonly blocked: Uint8Array;

	constructor(map: EstuaryMap) {
		this.blocked = new Uint8Array(this.cols * this.rows);
		for (let row = 0; row < this.rows; row++) {
			for (let col = 0; col < this.cols; col++) {
				const point = this.cellCenter(col, row);
				if (!this.inWater(map, point)) {
					this.blocked[this.index(col, row)] = 1;
					continue;
				}
				if (
					map.sandbars.some((sandbar) => {
						const dx = (point.x - sandbar.x) / (sandbar.rx + 28);
						const dy = (point.y - sandbar.y) / (sandbar.ry + 28);
						return dx * dx + dy * dy < 1;
					})
				) {
					this.blocked[this.index(col, row)] = 1;
					continue;
				}
				if (
					map.driftwood.some((log) => {
						const dx = point.x - log.x;
						const dy = point.y - log.y;
						const cos = Math.cos(log.angle);
						const sin = Math.sin(log.angle);
						const along = Math.abs(dx * cos + dy * sin);
						const across = Math.abs(-dx * sin + dy * cos);
						return along < log.length / 2 + 22 && across < 34;
					})
				) {
					this.blocked[this.index(col, row)] = 1;
				}
			}
		}
	}

	private inWater(map: EstuaryMap, point: Point): boolean {
		if (
			point.x < 28 ||
			point.x > WORLD_WIDTH - 28 ||
			point.y < topShoreAt(map, point.x) + 34 ||
			point.y > bottomShoreAt(map, point.x) - 34
		) {
			return false;
		}
		return true;
	}

	private index(col: number, row: number): number {
		return row * this.cols + col;
	}

	private cellCenter(col: number, row: number): Point {
		return {
			x: (col + 0.5) * NAV_CELL,
			y: (row + 0.5) * NAV_CELL,
		};
	}

	private cellOf(point: Point): { col: number; row: number } {
		return {
			col: Math.max(0, Math.min(this.cols - 1, Math.floor(point.x / NAV_CELL))),
			row: Math.max(0, Math.min(this.rows - 1, Math.floor(point.y / NAV_CELL))),
		};
	}

	private nearestOpen(point: Point): { col: number; row: number } | null {
		const start = this.cellOf(point);
		if (this.blocked[this.index(start.col, start.row)] === 0) return start;
		for (let radius = 1; radius <= 6; radius++) {
			for (let dy = -radius; dy <= radius; dy++) {
				for (let dx = -radius; dx <= radius; dx++) {
					const col = start.col + dx;
					const row = start.row + dy;
					if (
						col >= 0 &&
						col < this.cols &&
						row >= 0 &&
						row < this.rows &&
						this.blocked[this.index(col, row)] === 0
					) {
						return { col, row };
					}
				}
			}
		}
		return null;
	}

	findPath(from: Point, to: Point): Point[] | null {
		const start = this.nearestOpen(from);
		const goal = this.nearestOpen(to);
		if (!start || !goal) return null;
		const count = this.cols * this.rows;
		const gScore = new Float32Array(count);
		gScore.fill(Number.POSITIVE_INFINITY);
		const cameFrom = new Int32Array(count);
		cameFrom.fill(-1);
		const closed = new Uint8Array(count);
		const open = new MinHeap();
		const startIndex = this.index(start.col, start.row);
		const goalIndex = this.index(goal.col, goal.row);
		gScore[startIndex] = 0;
		open.push(startIndex, 0);
		const directions = [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
			[-1, -1],
			[-1, 1],
			[1, -1],
			[1, 1],
		] as const;

		while (open.size > 0) {
			const current = open.pop();
			if (current === undefined) break;
			if (closed[current] === 1) continue;
			if (current === goalIndex) return this.reconstruct(cameFrom, current);
			closed[current] = 1;
			const col = current % this.cols;
			const row = Math.floor(current / this.cols);
			for (const [dx, dy] of directions) {
				const nextCol = col + dx;
				const nextRow = row + dy;
				if (
					nextCol < 0 ||
					nextCol >= this.cols ||
					nextRow < 0 ||
					nextRow >= this.rows
				) {
					continue;
				}
				const next = this.index(nextCol, nextRow);
				if (closed[next] === 1 || this.blocked[next] === 1) continue;
				if (
					dx !== 0 &&
					dy !== 0 &&
					(this.blocked[this.index(col + dx, row)] === 1 ||
						this.blocked[this.index(col, row + dy)] === 1)
				) {
					continue;
				}
				const step = dx === 0 || dy === 0 ? 1 : Math.SQRT2;
				const tentative = gScore[current] + step;
				if (tentative >= gScore[next]) continue;
				cameFrom[next] = current;
				gScore[next] = tentative;
				const h = Math.hypot(goal.col - nextCol, goal.row - nextRow);
				open.push(next, tentative + h);
			}
		}
		return null;
	}

	private reconstruct(cameFrom: Int32Array, current: number): Point[] {
		const path: Point[] = [];
		let node = current;
		while (node !== -1) {
			const col = node % this.cols;
			const row = Math.floor(node / this.cols);
			path.push(this.cellCenter(col, row));
			node = cameFrom[node];
		}
		return path.reverse();
	}
}

function inWater(map: EstuaryMap, x: number, y: number, margin = 0): boolean {
	return (
		x >= margin &&
		x <= WORLD_WIDTH - margin &&
		y > topShoreAt(map, x) + margin &&
		y < bottomShoreAt(map, x) - margin
	);
}

function clampCorridor(map: EstuaryMap, points: Point[]): Point[] {
	return points.map((point) => ({
		x: Math.max(70, Math.min(WORLD_WIDTH - 70, point.x)),
		y: Math.max(
			topShoreAt(map, point.x) + 80,
			Math.min(bottomShoreAt(map, point.x) - 80, point.y),
		),
	}));
}

function overlapsSandbar(
	sandbars: Sandbar[],
	x: number,
	y: number,
	radius: number,
): boolean {
	return sandbars.some((sandbar) => {
		const dx = (x - sandbar.x) / (sandbar.rx + radius);
		const dy = (y - sandbar.y) / (sandbar.ry + radius);
		return dx * dx + dy * dy < 1;
	});
}

function buildHazards(
	map: EstuaryMap,
	random: () => number,
	corridorPad: number,
): { sandbars: Sandbar[]; driftwood: Driftwood[] } {
	const sandbars: Sandbar[] = [];
	const driftwood: Driftwood[] = [];
	const fixedPoints = [map.dock, map.start, ...map.zones];
	const isFarFromLandmarks = (x: number, y: number, radius: number) =>
		fixedPoints.every((point) => Math.hypot(point.x - x, point.y - y) > radius);

	for (let index = 0; index < 18; index++) {
		for (let attempt = 0; attempt < 500; attempt++) {
			const x = 100 + random() * (WORLD_WIDTH - 200);
			const y =
				topShoreAt(map, x) +
				90 +
				random() * (bottomShoreAt(map, x) - topShoreAt(map, x) - 180);
			const rx = 42 + random() * 78;
			const ry = 30 + random() * 58;
			const radius = Math.max(rx, ry);
			const corridorDistance = distanceToCorridors({ x, y }, map.corridors);
			if (corridorDistance < ROUTE_CLEARANCE + corridorPad + radius) continue;
			if (overlapsSandbar(sandbars, x, y, 18)) continue;
			if (!isFarFromLandmarks(x, y, 220)) continue;
			if (!inWater(map, x, y, radius + 22)) continue;
			sandbars.push({ x, y, rx, ry, phase: random() * Math.PI * 2 });
			break;
		}
	}

	for (let index = 0; index < 24; index++) {
		for (let attempt = 0; attempt < 500; attempt++) {
			const x = 100 + random() * (WORLD_WIDTH - 200);
			const y =
				topShoreAt(map, x) +
				70 +
				random() * (bottomShoreAt(map, x) - topShoreAt(map, x) - 140);
			const length = 36 + random() * 64;
			const angle = random() * Math.PI;
			const corridorDistance = distanceToCorridors({ x, y }, map.corridors);
			if (corridorDistance < ROUTE_CLEARANCE + corridorPad + length * 0.5) {
				continue;
			}
			if (overlapsSandbar(sandbars, x, y, 24)) continue;
			if (!isFarFromLandmarks(x, y, 180)) continue;
			if (!inWater(map, x, y, 34)) continue;
			driftwood.push({ x, y, length, angle });
			break;
		}
	}

	return { sandbars, driftwood };
}

function pathLength(path: Point[]): number {
	let length = 0;
	for (let i = 1; i < path.length; i++) {
		length += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
	}
	return Math.round(length);
}

function validateRoutes(map: EstuaryMap): RouteCheck[] {
	const grid = new NavGrid(map);
	const checks: RouteCheck[] = [];
	const addCheck = (
		fromName: string,
		from: Point,
		toName: string,
		to: Point,
	) => {
		const path = grid.findPath(from, to);
		checks.push({
			from: fromName,
			to: toName,
			ok: path !== null,
			length: path ? pathLength(path) : 0,
		});
	};
	for (const zone of map.zones) {
		addCheck("Dock", map.dock, zone.name, zone);
	}
	for (let index = 0; index < map.zones.length - 1; index++) {
		addCheck(
			map.zones[index].name,
			map.zones[index],
			map.zones[index + 1].name,
			map.zones[index + 1],
		);
	}
	const lastZone = map.zones[map.zones.length - 1];
	addCheck(
		lastZone?.name ?? "Last buoy",
		lastZone ?? map.dock,
		"Dock",
		map.dock,
	);
	return checks;
}

function createScenery(seed: number, attempt: number): EstuaryMap {
	const random = mulberry32(seed + attempt * 0x9e3779b9);
	const topShore: number[] = [];
	const bottomShore: number[] = [];
	const topPhase = random() * Math.PI * 2;
	const bottomPhase = random() * Math.PI * 2;
	for (let index = 0; index < SHORE_POINTS; index++) {
		const x = index * SHORE_STEP;
		topShore.push(
			145 +
				68 * Math.sin(x * 0.0032 + topPhase) +
				34 * Math.sin(x * 0.0105 + topPhase * 1.7) +
				(random() * 32 - 16),
		);
		bottomShore.push(
			1365 -
				72 * Math.sin(x * 0.0028 + bottomPhase) -
				28 * Math.sin(x * 0.011 + bottomPhase * 1.4) +
				(random() * 30 - 15),
		);
	}
	const map: EstuaryMap = {
		seed,
		topShore,
		bottomShore,
		sandbars: [],
		driftwood: [],
		zones: [],
		dock: { x: 270, y: 0 },
		start: { x: 0, y: 0 },
		dockRadius: 82,
		corridors: [],
		routes: [],
	};
	map.dock.y = bottomShoreAt(map, map.dock.x) - 126;
	map.start = { x: map.dock.x + 34, y: map.dock.y - 52 };
	const baseZones = [
		{ x: 780, y: 430 },
		{ x: 1510, y: 365 },
		{ x: 1880, y: 930 },
		{ x: 1030, y: 1130 },
	];
	map.zones = baseZones.map((zone, index) => {
		const x = Math.max(
			430,
			Math.min(WORLD_WIDTH - 220, zone.x + (random() * 110 - 55)),
		);
		const y = Math.max(
			topShoreAt(map, x) + 150,
			Math.min(bottomShoreAt(map, x) - 140, zone.y + (random() * 90 - 45)),
		);
		return {
			x,
			y,
			index,
			radius: 96,
			name: ZONE_NAMES[index],
		};
	});
	const routeNodes = [map.dock, ...map.zones, map.dock];
	for (let index = 1; index < routeNodes.length; index++) {
		map.corridors.push(
			clampCorridor(
				map,
				makeCorridor(routeNodes[index - 1], routeNodes[index], random, 0.13),
			),
		);
	}
	const hazards = buildHazards(map, random, attempt * 12);
	map.sandbars = hazards.sandbars;
	map.driftwood = hazards.driftwood;
	return map;
}

export function generateEstuary(seed: number): EstuaryMap {
	let fallback: EstuaryMap | null = null;
	for (let attempt = 0; attempt < 8; attempt++) {
		const map = createScenery(seed, attempt);
		map.routes = validateRoutes(map);
		fallback = map;
		if (map.routes.every((route) => route.ok)) {
			return map;
		}
	}
	if (fallback !== null) {
		fallback.corridors = [];
		fallback.sandbars = [];
		fallback.driftwood = [];
		fallback.routes = validateRoutes(fallback);
		return fallback;
	}
	throw new Error("could not generate an estuary");
}
