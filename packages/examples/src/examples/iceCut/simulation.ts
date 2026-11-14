/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import {
	AMBIENT_TEMP,
	CUT_MIN_TEMP,
	CUT_THROUGH_THRESHOLD,
	CUTTER_ACCEL,
	CUTTER_STOP_ACCEL,
	ICE,
	IDEAL_TEMP,
	INITIAL_THICKNESS,
	MASK_H,
	MASK_SCALE,
	MASK_W,
	MAX_CUTTER_SPEED,
	MAX_TEMP,
	MELT_TEMP,
	MIN_BODY_INTEGRITY,
	MIN_TEMP,
	type Point,
	RUN_TIME,
	SHAPES,
	TARGET_COMPLETE_COVERAGE,
	TARGET_COMPLETE_QUALITY,
	TARGET_HIT_RADIUS,
	TEMP_DECAY,
	TEMP_RATE,
} from "./constants";

export type GameStatus = "ready" | "running" | "won" | "lost";
export type FailureReason = "CUT THROUGH" | "TIME EXPIRED" | "BODY TOO THIN";

export interface Controls {
	tempUp: boolean;
	tempDown: boolean;
	cutLeft: boolean;
	cutRight: boolean;
	cutUp: boolean;
	cutDown: boolean;
}

export const NO_CONTROLS: Controls = {
	tempUp: false,
	tempDown: false,
	cutLeft: false,
	cutRight: false,
	cutUp: false,
	cutDown: false,
};

export interface TargetSample extends Point {
	hit: boolean;
	quality: number;
}

export interface ShapeProgress {
	completed: boolean;
	coverage: number;
	quality: number;
	hitCount: number;
	sampleCount: number;
}

export interface SurfaceStats {
	meanThickness: number;
	minThickness: number;
	meltedPixels: number;
	maxHeat: number;
	bodyIntegrity: number;
}

export interface DebugSnapshot {
	status: GameStatus;
	failureReason: FailureReason | null;
	timeLeft: number;
	elapsed: number;
	temperature: number;
	cutter: Point;
	cutterWorld: Point;
	speed: number;
	edgeQuality: number;
	lastCutRate: number;
	bodyIntegrity: number;
	meanThickness: number;
	minThickness: number;
	meltedPixels: number;
	maxHeat: number;
	targets: Array<
		ShapeProgress & {
			id: string;
			name: string;
			samples: Array<{
				x: number;
				y: number;
				hit: boolean;
				quality: number;
			}>;
		}
	>;
}

interface ShapeRuntime {
	spec: (typeof SHAPES)[number];
	samples: TargetSample[];
	completed: boolean;
	completionTime: number | null;
}

const clamp = (value: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, value));

const smoothstep = (lo: number, hi: number, value: number): number => {
	const t = clamp((value - lo) / (hi - lo), 0, 1);
	return t * t * (3 - 2 * t);
};

const sampleClosedPath = (path: Point[], spacing: number): Point[] => {
	const samples: Point[] = [];
	for (let i = 0; i < path.length; i++) {
		const a = path[i];
		const b = path[(i + 1) % path.length];
		const length = Math.hypot(b.x - a.x, b.y - a.y);
		const steps = Math.max(1, Math.ceil(length / spacing));
		for (let step = 0; step < steps; step++) {
			const t = step / steps;
			samples.push({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t,
			});
		}
	}
	return samples;
};

const pointSegmentDistanceSq = (
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number => {
	const abx = bx - ax;
	const aby = by - ay;
	const lengthSq = abx * abx + aby * aby;
	if (lengthSq <= 0.0001) {
		const dx = px - ax;
		const dy = py - ay;
		return dx * dx + dy * dy;
	}
	const t = clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
	const dx = px - (ax + abx * t);
	const dy = py - (ay + aby * t);
	return dx * dx + dy * dy;
};

const hashNoise = (x: number, y: number): number => {
	const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return (n - Math.floor(n)) * 2 - 1;
};

export class IceCutSimulation {
	readonly thickness = new Float32Array(MASK_W * MASK_H);
	readonly heat = new Float32Array(MASK_W * MASK_H);
	readonly inside = new Uint8Array(MASK_W * MASK_H);
	readonly surfaceNoise = new Float32Array(MASK_W * MASK_H);

	status: GameStatus = "ready";
	failureReason: FailureReason | null = null;
	timeLeft = RUN_TIME;
	elapsed = 0;
	temperature = AMBIENT_TEMP;
	cutter = { x: 0, y: 0 };
	velocity = { x: 0, y: 0 };
	speed = 0;
	edgeQuality = 0;
	lastCutRate = 0;
	maskVersion = 0;
	stats: SurfaceStats = {
		meanThickness: INITIAL_THICKNESS,
		minThickness: INITIAL_THICKNESS,
		meltedPixels: 0,
		maxHeat: 0,
		bodyIntegrity: 1,
	};
	shapes: ShapeRuntime[] = [];
	completedShapes = 0;

	onShapeComplete: ((shape: ShapeRuntime, index: number) => void) | null = null;
	onFailure: ((reason: FailureReason) => void) | null = null;
	onWin: (() => void) | null = null;

	private readonly heatNext = new Float32Array(MASK_W * MASK_H);
	private heatTimer = 0;
	private statsTimer = 0;
	private previousCutter = { x: 0, y: 0 };
	private cutThroughDetected = false;

	constructor() {
		this.buildSurfaceMask();
		this.reset();
	}

	reset(): void {
		this.thickness.fill(INITIAL_THICKNESS);
		this.heat.fill(0);
		this.heatNext.fill(0);
		this.status = "ready";
		this.failureReason = null;
		this.timeLeft = RUN_TIME;
		this.elapsed = 0;
		this.temperature = AMBIENT_TEMP;
		this.speed = 0;
		this.edgeQuality = 0;
		this.lastCutRate = 0;
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.heatTimer = 0;
		this.statsTimer = 0;
		this.completedShapes = 0;
		this.cutThroughDetected = false;
		this.stats = {
			meanThickness: INITIAL_THICKNESS,
			minThickness: INITIAL_THICKNESS,
			meltedPixels: 0,
			maxHeat: 0,
			bodyIntegrity: 1,
		};
		this.shapes = SHAPES.map((spec) => ({
			spec,
			samples: sampleClosedPath(spec.points, 6.5).map((point) => ({
				...point,
				hit: false,
				quality: 0,
			})),
			completed: false,
			completionTime: null,
		}));
		const first = this.shapes[0]?.samples[0];
		this.cutter.x = first ? first.x : 120;
		this.cutter.y = first ? first.y + 3 : 260;
		this.previousCutter.x = this.cutter.x;
		this.previousCutter.y = this.cutter.y;
		this.maskVersion++;
	}

	start(): void {
		if (this.status !== "ready") {
			return;
		}
		this.status = "running";
	}

	update(dtMs: number, controls: Controls): void {
		if (this.status !== "running") {
			this.velocity.x = 0;
			this.velocity.y = 0;
			return;
		}

		const dt = Math.min(100, Math.max(0, dtMs));
		const seconds = dt / 1000;
		this.elapsed += seconds;
		this.timeLeft = Math.max(0, RUN_TIME - this.elapsed);
		if (this.timeLeft <= 0) {
			this.fail("TIME EXPIRED");
			return;
		}

		const tempDelta =
			(controls.tempUp ? TEMP_RATE : 0) - (controls.tempDown ? TEMP_RATE : 0);
		if (tempDelta !== 0) {
			this.temperature = clamp(
				this.temperature + tempDelta * seconds,
				MIN_TEMP,
				MAX_TEMP,
			);
		} else {
			const decay = TEMP_DECAY * seconds;
			this.temperature =
				this.temperature > AMBIENT_TEMP
					? Math.max(AMBIENT_TEMP, this.temperature - decay)
					: Math.min(AMBIENT_TEMP, this.temperature + decay);
		}

		const moveX = (controls.cutRight ? 1 : 0) - (controls.cutLeft ? 1 : 0);
		const moveY = (controls.cutDown ? 1 : 0) - (controls.cutUp ? 1 : 0);
		let wantedX = moveX * MAX_CUTTER_SPEED;
		let wantedY = moveY * MAX_CUTTER_SPEED;
		if (moveX !== 0 && moveY !== 0) {
			wantedX *= Math.SQRT1_2;
			wantedY *= Math.SQRT1_2;
		}

		const hasMoveInput = moveX !== 0 || moveY !== 0;
		const accel = hasMoveInput ? CUTTER_ACCEL : CUTTER_STOP_ACCEL;
		const follow = 1 - Math.exp(-accel * seconds);
		this.velocity.x += (wantedX - this.velocity.x) * follow;
		this.velocity.y += (wantedY - this.velocity.y) * follow;
		if (!hasMoveInput && Math.abs(this.velocity.x) < 0.4) {
			this.velocity.x = 0;
		}
		if (!hasMoveInput && Math.abs(this.velocity.y) < 0.4) {
			this.velocity.y = 0;
		}

		this.previousCutter.x = this.cutter.x;
		this.previousCutter.y = this.cutter.y;
		this.cutter.x = clamp(
			this.cutter.x + this.velocity.x * seconds,
			12,
			ICE.w - 12,
		);
		this.cutter.y = clamp(
			this.cutter.y + this.velocity.y * seconds,
			12,
			ICE.h - 12,
		);
		const travelled = Math.hypot(
			this.cutter.x - this.previousCutter.x,
			this.cutter.y - this.previousCutter.y,
		);
		const rawSpeed = travelled / Math.max(seconds, 0.0001);
		this.speed += (rawSpeed - this.speed) * (1 - Math.exp(-10 * seconds));

		const cutEngagement = smoothstep(
			CUT_MIN_TEMP,
			CUT_MIN_TEMP + 12,
			this.temperature,
		);
		if (this.temperature > AMBIENT_TEMP + 1) {
			this.applyHeat(this.previousCutter, this.cutter, dt, cutEngagement);
		}
		this.diffuseHeat(dt);

		if (this.cutThroughDetected) {
			this.fail("CUT THROUGH");
			return;
		}
		if (cutEngagement > 0.05 && this.speed > 10 && this.status === "running") {
			const quality = this.currentQuality(cutEngagement);
			this.updateTargets(quality, cutEngagement);
			this.edgeQuality +=
				(quality - this.edgeQuality) * (1 - Math.exp(-7 * seconds));
		} else {
			this.edgeQuality += (0 - this.edgeQuality) * (1 - Math.exp(-5 * seconds));
		}

		this.statsTimer += dt;
		if (this.statsTimer >= 200) {
			this.statsTimer = 0;
			this.refreshStats();
		}
	}

	private currentQuality(cutEngagement: number): number {
		const speedPenalty = clamp(
			(this.speed - 60) / (MAX_CUTTER_SPEED - 60 + 24),
			0,
			1,
		);
		const tempPenalty = clamp(
			Math.abs(this.temperature - IDEAL_TEMP) / 38,
			0,
			1,
		);
		const meltPenalty = smoothstep(MELT_TEMP, MAX_TEMP, this.temperature);
		return clamp(
			(1 -
				0.68 * speedPenalty * speedPenalty -
				0.55 * tempPenalty * tempPenalty -
				0.32 * meltPenalty) *
				(0.42 + 0.58 * cutEngagement),
			0,
			1,
		);
	}

	private applyHeat(
		from: Point,
		to: Point,
		dt: number,
		cutEngagement: number,
	): void {
		const pressure = clamp(
			(this.temperature - CUT_MIN_TEMP) / (MAX_TEMP - CUT_MIN_TEMP),
			0,
			1,
		);
		const danger = smoothstep(MELT_TEMP, MAX_TEMP, this.temperature);
		const radiusScreen = 6 + 8 * pressure + 13 * danger;
		const radiusMask = radiusScreen / MASK_SCALE;
		const depthRate = 38 + 240 * pressure ** 1.7 + 660 * danger ** 2.4;
		const scratch = smoothstep(AMBIENT_TEMP, CUT_MIN_TEMP, this.temperature);
		const effectiveEngagement = Math.max(cutEngagement, scratch * 0.16);
		this.lastCutRate = depthRate * effectiveEngagement;
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const distance = Math.hypot(dx, dy);
		const steps = Math.max(
			1,
			Math.ceil(distance / Math.max(2, radiusScreen * 0.55)),
		);
		const dtShare = dt / 1000 / steps;
		let changed = false;

		for (let step = 0; step < steps; step++) {
			const t = steps === 1 ? 1 : step / (steps - 1);
			const cx = (from.x + dx * t) / MASK_SCALE;
			const cy = (from.y + dy * t) / MASK_SCALE;
			const left = Math.max(1, Math.floor(cx - radiusMask));
			const right = Math.min(MASK_W - 2, Math.ceil(cx + radiusMask));
			const top = Math.max(1, Math.floor(cy - radiusMask));
			const bottom = Math.min(MASK_H - 2, Math.ceil(cy + radiusMask));
			const radiusSq = radiusMask * radiusMask;

			for (let y = top; y <= bottom; y++) {
				const dyPx = y + 0.5 - cy;
				for (let x = left; x <= right; x++) {
					const dxPx = x + 0.5 - cx;
					const distSq = dxPx * dxPx + dyPx * dyPx;
					if (distSq > radiusSq) {
						continue;
					}
					const index = y * MASK_W + x;
					if (this.inside[index] === 0) {
						continue;
					}
					const dist = Math.sqrt(distSq) / radiusMask;
					const falloff = (1 - dist) ** 1.55;
					const depthLoss = depthRate * effectiveEngagement * dtShare * falloff;
					if (depthLoss > 0.0001) {
						const next = Math.max(0, this.thickness[index] - depthLoss);
						this.thickness[index] = next;
						if (next <= CUT_THROUGH_THRESHOLD) {
							this.cutThroughDetected = true;
						}
						changed = true;
					}
					const heatGain =
						(0.28 + pressure * 0.9 + danger * 2.8) *
						dtShare *
						falloff *
						(0.35 + Math.max(cutEngagement, scratch) * 0.65);
					if (heatGain > 0.0001) {
						this.heat[index] = Math.min(1.5, this.heat[index] + heatGain);
						changed = true;
					}
				}
			}
		}

		if (changed) {
			this.maskVersion++;
		}
	}

	private diffuseHeat(dt: number): void {
		this.heatTimer += dt;
		if (this.heatTimer < 90) {
			return;
		}
		this.heatTimer = 0;

		let hasHeat = false;
		for (let y = 1; y < MASK_H - 1; y++) {
			for (let x = 1; x < MASK_W - 1; x++) {
				const index = y * MASK_W + x;
				if (this.inside[index] === 0) {
					this.heatNext[index] = 0;
					continue;
				}
				const spread =
					this.heat[index - 1] +
					this.heat[index + 1] +
					this.heat[index - MASK_W] +
					this.heat[index + MASK_W];
				const value = (this.heat[index] * 0.71 + spread * 0.07) * 0.988;
				this.heatNext[index] = value;
				if (value > 0.012) {
					hasHeat = true;
				}
			}
		}

		this.heat.set(this.heatNext);
		if (!hasHeat) {
			this.heat.fill(0);
			return;
		}

		for (let i = 0; i < this.heat.length; i++) {
			const h = this.heat[i];
			if (h > 0.012 && this.inside[i] !== 0) {
				this.thickness[i] = Math.max(0, this.thickness[i] - h * 0.3);
				if (this.thickness[i] <= CUT_THROUGH_THRESHOLD) {
					this.cutThroughDetected = true;
				}
			}
		}
		this.maskVersion++;
	}

	private updateTargets(quality: number, cutEngagement: number): void {
		const hitRadiusSq = TARGET_HIT_RADIUS * TARGET_HIT_RADIUS;
		for (const shape of this.shapes) {
			if (shape.completed) {
				continue;
			}
			for (const sample of shape.samples) {
				const distSq = pointSegmentDistanceSq(
					sample.x,
					sample.y,
					this.previousCutter.x,
					this.previousCutter.y,
					this.cutter.x,
					this.cutter.y,
				);
				if (distSq <= hitRadiusSq) {
					const sampleQuality = quality * (0.45 + 0.55 * cutEngagement);
					sample.hit = true;
					sample.quality = Math.max(sample.quality, sampleQuality);
				}
			}
			const progress = this.shapeProgress(shape);
			if (
				progress.coverage >= TARGET_COMPLETE_COVERAGE &&
				progress.quality >= TARGET_COMPLETE_QUALITY
			) {
				this.completeShape(shape);
			}
		}
	}

	private completeShape(shape: ShapeRuntime): void {
		shape.completed = true;
		shape.completionTime = this.elapsed;
		this.completedShapes++;
		this.onShapeComplete?.(shape, this.shapes.indexOf(shape));
		if (this.completedShapes >= this.shapes.length) {
			this.status = "won";
			this.onWin?.();
		}
	}

	private refreshStats(): void {
		let count = 0;
		let sum = 0;
		let min = INITIAL_THICKNESS;
		let melted = 0;
		let maxHeat = 0;
		for (let i = 0; i < this.thickness.length; i++) {
			if (this.inside[i] === 0) {
				continue;
			}
			const value = this.thickness[i];
			count++;
			sum += value;
			min = Math.min(min, value);
			if (value < 10) {
				melted++;
			}
			if (this.heat[i] > maxHeat) {
				maxHeat = this.heat[i];
			}
		}
		const mean = count > 0 ? sum / count : 0;
		this.stats = {
			meanThickness: mean,
			minThickness: min,
			meltedPixels: melted,
			maxHeat,
			bodyIntegrity: mean / INITIAL_THICKNESS,
		};
		if (this.status !== "running") {
			return;
		}
		if (min <= CUT_THROUGH_THRESHOLD) {
			this.fail("CUT THROUGH");
			return;
		}
		if (this.stats.bodyIntegrity < MIN_BODY_INTEGRITY) {
			this.fail("BODY TOO THIN");
		}
	}

	private fail(reason: FailureReason): void {
		if (this.status !== "running") {
			return;
		}
		this.status = "lost";
		this.failureReason = reason;
		this.velocity.x = 0;
		this.velocity.y = 0;
		this.refreshStats();
		this.onFailure?.(reason);
	}

	shapeProgress(shape: ShapeRuntime): ShapeProgress {
		let hitCount = 0;
		let qualitySum = 0;
		for (const sample of shape.samples) {
			if (sample.hit) {
				hitCount++;
				qualitySum += sample.quality;
			}
		}
		return {
			completed: shape.completed,
			coverage: shape.samples.length > 0 ? hitCount / shape.samples.length : 0,
			quality: shape.samples.length > 0 ? qualitySum / shape.samples.length : 0,
			hitCount,
			sampleCount: shape.samples.length,
		};
	}

	getDebugSnapshot(): DebugSnapshot {
		return {
			status: this.status,
			failureReason: this.failureReason,
			timeLeft: this.timeLeft,
			elapsed: this.elapsed,
			temperature: this.temperature,
			cutter: { x: this.cutter.x, y: this.cutter.y },
			cutterWorld: {
				x: ICE.x + this.cutter.x,
				y: ICE.y + this.cutter.y,
			},
			speed: this.speed,
			edgeQuality: this.edgeQuality,
			lastCutRate: this.lastCutRate,
			bodyIntegrity: this.stats.bodyIntegrity,
			meanThickness: this.stats.meanThickness,
			minThickness: this.stats.minThickness,
			meltedPixels: this.stats.meltedPixels,
			maxHeat: this.stats.maxHeat,
			targets: this.shapes.map((shape) => {
				const progress = this.shapeProgress(shape);
				return {
					...progress,
					id: shape.spec.id,
					name: shape.spec.name,
					samples: shape.samples.map((sample) => ({
						x: ICE.x + sample.x,
						y: ICE.y + sample.y,
						hit: sample.hit,
						quality: sample.quality,
					})),
				};
			}),
		};
	}

	private buildSurfaceMask(): void {
		const radius = 30;
		for (let y = 0; y < MASK_H; y++) {
			for (let x = 0; x < MASK_W; x++) {
				const index = y * MASK_W + x;
				const cornerX = Math.min(x, MASK_W - 1 - x);
				const cornerY = Math.min(y, MASK_H - 1 - y);
				let inside = cornerX > 1 && cornerY > 1;
				if (inside && cornerX < radius && cornerY < radius) {
					const dx = radius - cornerX;
					const dy = radius - cornerY;
					inside = dx * dx + dy * dy <= radius * radius;
				}
				this.inside[index] = inside ? 1 : 0;
				this.surfaceNoise[index] = hashNoise(x, y);
			}
		}
	}
}
