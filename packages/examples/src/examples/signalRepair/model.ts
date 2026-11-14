export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;

export const MODULE_ORDER = ["hpf", "lpf", "delay", "gain"] as const;

export type ModuleKind = (typeof MODULE_ORDER)[number];
export type NodeId = "src" | ModuleKind | "out";

export interface PatchEdge {
	from: NodeId;
	to: NodeId;
}

export interface ModuleRange {
	min: number;
	max: number;
	step: number;
	window: number;
}

export const MODULE_META: Record<
	ModuleKind,
	{ label: string; short: string; range: ModuleRange }
> = {
	hpf: {
		label: "HIGH-PASS",
		short: "HPF",
		range: { min: 60, max: 900, step: 5, window: 70 },
	},
	lpf: {
		label: "LOW-PASS",
		short: "LPF",
		range: { min: 700, max: 7000, step: 25, window: 700 },
	},
	delay: {
		label: "DELAY",
		short: "DLY",
		range: { min: 0.02, max: 0.5, step: 0.005, window: 0.06 },
	},
	gain: {
		label: "GAIN",
		short: "GAIN",
		range: { min: 0.05, max: 1.2, step: 0.01, window: 0.14 },
	},
};

export interface LaneMeta {
	code: string;
	name: string;
	detail: string;
	color: string;
	dim: string;
}

export const LANE_META: readonly LaneMeta[] = [
	{
		code: "CH 01",
		name: "LOW RUMBLE",
		detail: "LOW-FREQUENCY NOISE",
		color: "#53d9ff",
		dim: "#153e4a",
	},
	{
		code: "CH 02",
		name: "ECHO LOOP",
		detail: "REPEATED REFLECTIONS",
		color: "#ffc55d",
		dim: "#4a3819",
	},
	{
		code: "CH 03",
		name: "CHIRP BURST",
		detail: "INTERMITTENT CHIRP",
		color: "#ff6f9f",
		dim: "#4b2030",
	},
];

export interface LaneTarget {
	hpf: number;
	lpf: number;
	delay: number;
	gain: number;
}

export interface LaneState {
	target: LaneTarget;
	values: LaneTarget;
	edges: PatchEdge[];
}

export interface RepairModel {
	seed: number;
	lanes: LaneState[];
}

export type GamePhase = "standby" | "running" | "success" | "failure";

export interface GameSnapshot {
	seed: number;
	phase: GamePhase;
	trips: number;
	stableMs: number;
	silentMs: number;
	protectionMs: number;
	quality: number;
	laneQuality: number[];
	masterLevel: number;
	reason: string;
	paths: NodeId[][];
}

export interface ConnectResult {
	accepted: boolean;
	feedback: boolean;
	badEdge?: PatchEdge;
}

export const PROTECTION_LIMIT = 5;
export const STABLE_TARGET_MS = 10_000;
export const SILENCE_LIMIT_MS = 3_000;
export const PROTECTION_MS = 1_500;
export const PASS_QUALITY = 0.82;
export const MASTER_LEVEL_MIN = 0.018;

const TARGET_RANGES: Record<ModuleKind, readonly [number, number]> = {
	hpf: [190, 330],
	lpf: [900, 2600],
	delay: [0.07, 0.32],
	gain: [0.42, 0.76],
};

const LANE_BIAS: readonly Record<ModuleKind, readonly [number, number]>[] = [
	{
		hpf: [0.72, 1],
		lpf: [0.05, 0.42],
		delay: [0, 0.35],
		gain: [0.48, 0.82],
	},
	{
		hpf: [0, 0.28],
		lpf: [0.4, 0.82],
		delay: [0.55, 1],
		gain: [0.6, 0.95],
	},
	{
		hpf: [0, 0.22],
		lpf: [0, 0.36],
		delay: [0, 0.3],
		gain: [0.2, 0.55],
	},
];

function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function snap(value: number, step: number): number {
	const precision = Math.max(0, Math.ceil(-Math.log10(step)));
	return Number((Math.round(value / step) * step).toFixed(precision));
}

function randomInRange(
	random: () => number,
	min: number,
	max: number,
	step: number,
): number {
	return snap(min + random() * (max - min), step);
}

function targetForLane(
	random: () => number,
	lane: number,
	kind: ModuleKind,
): number {
	const [baseMin, baseMax] = TARGET_RANGES[kind];
	const [biasMin, biasMax] = LANE_BIAS[lane][kind];
	const min = baseMin + (baseMax - baseMin) * biasMin;
	const max = baseMin + (baseMax - baseMin) * biasMax;
	return randomInRange(random, min, max, MODULE_META[kind].range.step);
}

function targetSet(random: () => number, lane: number): LaneTarget {
	return {
		hpf: targetForLane(random, lane, "hpf"),
		lpf: targetForLane(random, lane, "lpf"),
		delay: targetForLane(random, lane, "delay"),
		gain: targetForLane(random, lane, "gain"),
	};
}

function scrambledSet(random: () => number): LaneTarget {
	const scramble = (kind: ModuleKind): number => {
		const range = MODULE_META[kind].range;
		const lower = range.min + (range.max - range.min) * 0.08;
		const upper = range.min + (range.max - range.min) * 0.92;
		return randomInRange(random, lower, upper, range.step);
	};
	return {
		hpf: scramble("hpf"),
		lpf: scramble("lpf"),
		delay: scramble("delay"),
		gain: scramble("gain"),
	};
}

export function edgesForChain(order: readonly ModuleKind[]): PatchEdge[] {
	const nodes: NodeId[] = ["src", ...order, "out"];
	const edges: PatchEdge[] = [];
	for (let i = 0; i < nodes.length - 1; i++) {
		edges.push({ from: nodes[i], to: nodes[i + 1] });
	}
	return edges;
}

export function createModel(seed: number): RepairModel {
	const normalized = seed >>> 0;
	const random = mulberry32(normalized);
	const lanes: LaneState[] = [];
	for (let lane = 0; lane < LANE_META.length; lane++) {
		const target = targetSet(random, lane);
		const values = scrambledSet(random);
		const missing = Math.floor(random() * MODULE_ORDER.length);
		const order = MODULE_ORDER.filter((_, index) => index !== missing);
		lanes.push({
			target,
			values,
			edges: edgesForChain(order),
		});
	}
	return { seed: normalized, lanes };
}

export function parseSeed(input: string | null | undefined): number {
	if (!input) return 0x5eeda11;
	const trimmed = input.trim();
	if (/^0x[0-9a-f]+$/i.test(trimmed)) {
		return Number.parseInt(trimmed, 16) >>> 0;
	}
	if (/^\d+$/.test(trimmed)) {
		return Number.parseInt(trimmed, 10) >>> 0;
	}
	let hash = 2166136261;
	for (let i = 0; i < trimmed.length; i++) {
		hash ^= trimmed.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function seedLabel(seed: number): string {
	return `0x${(seed >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

export function outgoingEdge(
	edges: readonly PatchEdge[],
	from: NodeId,
): PatchEdge | undefined {
	return edges.find((edge) => edge.from === from);
}

export function pathFromSource(edges: readonly PatchEdge[]): NodeId[] {
	const path: NodeId[] = ["src"];
	const seen = new Set<NodeId>(["src"]);
	let current: NodeId = "src";
	while (current !== "out") {
		const edge = outgoingEdge(edges, current);
		if (!edge) break;
		path.push(edge.to);
		if (seen.has(edge.to)) break;
		seen.add(edge.to);
		current = edge.to;
	}
	return path;
}

export function pathReachesOutput(path: readonly NodeId[]): boolean {
	return path[path.length - 1] === "out";
}

export function hasCycle(edges: readonly PatchEdge[]): boolean {
	const visiting = new Set<NodeId>();
	const visited = new Set<NodeId>();
	const upstream = new Map<NodeId, NodeId>();
	for (const edge of edges) {
		upstream.set(edge.from, edge.to);
	}

	const visit = (node: NodeId): boolean => {
		if (visiting.has(node)) return true;
		if (visited.has(node)) return false;
		visiting.add(node);
		const next = upstream.get(node);
		if (next && visit(next)) return true;
		visiting.delete(node);
		visited.add(node);
		return false;
	};

	const nodes = new Set<NodeId>();
	for (const edge of edges) {
		nodes.add(edge.from);
		nodes.add(edge.to);
	}
	for (const node of nodes) {
		if (visit(node)) return true;
	}
	return false;
}

export function connectEdge(
	lane: LaneState,
	from: NodeId,
	to: NodeId,
): ConnectResult {
	const validFrom = from !== "out";
	const validTo = to !== "src";
	if (!validFrom || !validTo) {
		return { accepted: false, feedback: false };
	}
	if (from === to) {
		return {
			accepted: false,
			feedback: true,
			badEdge: { from, to },
		};
	}

	const next = lane.edges.filter(
		(edge) => edge.from !== from && edge.to !== to,
	);
	const edge = { from, to };
	next.push(edge);
	if (hasCycle(next)) {
		return { accepted: false, feedback: true, badEdge: edge };
	}
	lane.edges = next;
	return { accepted: true, feedback: false };
}

export function laneQuality(lane: LaneState): number {
	const path = pathFromSource(lane.edges);
	if (!pathReachesOutput(path)) return 0;
	const nodes = new Set(path);
	let total = 0;
	for (const kind of MODULE_ORDER) {
		if (!nodes.has(kind)) continue;
		const range = MODULE_META[kind].range;
		const error = Math.abs(lane.values[kind] - lane.target[kind]);
		total += 1 - clamp(error / range.window, 0, 1);
	}
	return total / MODULE_ORDER.length;
}

export function overallQuality(model: RepairModel): number {
	return (
		model.lanes.reduce((sum, lane) => sum + laneQuality(lane), 0) /
		model.lanes.length
	);
}

export function allLanesAcceptable(model: RepairModel): boolean {
	return model.lanes.every((lane) => laneQuality(lane) >= PASS_QUALITY);
}

export function applySolution(model: RepairModel): void {
	for (const lane of model.lanes) {
		lane.values = { ...lane.target };
		lane.edges = edgesForChain(MODULE_ORDER);
	}
}

export function formatModuleValue(kind: ModuleKind, value: number): string {
	switch (kind) {
		case "hpf":
		case "lpf":
			return value >= 1000
				? `${(value / 1000).toFixed(1)} kHz`
				: `${Math.round(value)} Hz`;
		case "delay":
			return `${Math.round(value * 1000)} ms`;
		case "gain": {
			const db = 20 * Math.log10(Math.max(0.0001, value));
			return `${db >= 0 ? "+" : ""}${db.toFixed(1)} dB`;
		}
	}
}

export class RepairSession {
	model: RepairModel;
	phase: GamePhase = "standby";
	trips = 0;
	stableMs = 0;
	silentMs = 0;
	protectionMs = 0;
	masterLevel = 0;
	reason = "";
	lastQuality: number;
	badEdge: PatchEdge | undefined;
	badEdgeLane = -1;
	badEdgeMs = 0;

	constructor(seed: number) {
		this.model = createModel(seed);
		this.lastQuality = overallQuality(this.model);
	}

	start(): void {
		if (this.phase === "standby") {
			this.phase = "running";
		}
	}

	restart(seed = this.model.seed): void {
		this.model = createModel(seed);
		this.phase = "standby";
		this.trips = 0;
		this.stableMs = 0;
		this.silentMs = 0;
		this.protectionMs = 0;
		this.masterLevel = 0;
		this.reason = "";
		this.lastQuality = overallQuality(this.model);
		this.badEdge = undefined;
		this.badEdgeLane = -1;
		this.badEdgeMs = 0;
	}

	connect(laneIndex: number, from: NodeId, to: NodeId): ConnectResult {
		if (this.phase !== "running") {
			return { accepted: false, feedback: false };
		}
		const lane = this.model.lanes[laneIndex];
		if (!lane) return { accepted: false, feedback: false };
		const result = connectEdge(lane, from, to);
		if (result.feedback && result.badEdge) {
			this.badEdge = result.badEdge;
			this.badEdgeLane = laneIndex;
			this.badEdgeMs = 1_400;
			this.tripProtection("FEEDBACK LOOP");
		}
		return result;
	}

	setKnob(laneIndex: number, kind: ModuleKind, value: number): void {
		const lane = this.model.lanes[laneIndex];
		if (!lane) return;
		const range = MODULE_META[kind].range;
		lane.values[kind] = snap(clamp(value, range.min, range.max), range.step);
	}

	forcePath(laneIndex: number, order: readonly ModuleKind[]): void {
		const lane = this.model.lanes[laneIndex];
		if (lane) lane.edges = edgesForChain(order);
	}

	applySolution(): void {
		applySolution(this.model);
		this.lastQuality = 1;
	}

	miswire(laneIndex = 0): ConnectResult {
		const lane = this.model.lanes[laneIndex];
		if (!lane) return { accepted: false, feedback: false };
		const path = pathFromSource(lane.edges).filter(
			(node): node is ModuleKind => node !== "src" && node !== "out",
		);
		if (path.length === 0) {
			const kind = MODULE_ORDER[0];
			return this.connect(laneIndex, kind, kind);
		}
		const from = path[path.length - 1];
		const to = path[0];
		return this.connect(laneIndex, from, to);
	}

	tripProtection(reason: string): void {
		if (this.phase !== "running") return;
		this.trips += 1;
		this.stableMs = 0;
		this.silentMs = 0;
		this.reason = reason;
		if (this.trips >= PROTECTION_LIMIT) {
			this.phase = "failure";
			this.protectionMs = 0;
		} else {
			this.protectionMs = PROTECTION_MS;
		}
	}

	tick(dt: number, masterLevel: number): void {
		const step = clamp(dt, 0, 100);
		this.masterLevel = masterLevel;
		this.lastQuality = overallQuality(this.model);
		if (this.badEdgeMs > 0) {
			this.badEdgeMs = Math.max(0, this.badEdgeMs - step);
			if (this.badEdgeMs === 0) {
				this.badEdge = undefined;
				this.badEdgeLane = -1;
			}
		}
		if (this.phase !== "running") return;
		if (this.protectionMs > 0) {
			this.protectionMs = Math.max(0, this.protectionMs - step);
			return;
		}

		if (masterLevel < MASTER_LEVEL_MIN) {
			this.silentMs += step;
			if (this.silentMs >= SILENCE_LIMIT_MS) {
				this.phase = "failure";
				this.reason = "MAIN SIGNAL LOST";
				return;
			}
		} else {
			this.silentMs = 0;
		}

		if (allLanesAcceptable(this.model) && masterLevel >= MASTER_LEVEL_MIN) {
			this.stableMs = Math.min(STABLE_TARGET_MS, this.stableMs + step);
			if (this.stableMs >= STABLE_TARGET_MS) {
				this.phase = "success";
				this.reason = "LINK STABLE";
			}
		} else {
			this.stableMs = 0;
		}
	}

	snapshot(): GameSnapshot {
		return {
			seed: this.model.seed,
			phase: this.phase,
			trips: this.trips,
			stableMs: this.stableMs,
			silentMs: this.silentMs,
			protectionMs: this.protectionMs,
			quality: this.lastQuality,
			laneQuality: this.model.lanes.map((lane) => laneQuality(lane)),
			masterLevel: this.masterLevel,
			reason: this.reason,
			paths: this.model.lanes.map((lane) => pathFromSource(lane.edges)),
		};
	}
}
