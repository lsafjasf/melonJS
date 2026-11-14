/**
 * melonJS — two-player gantry crane example: deterministic mechanical simulation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Kept free of rendering and audio dependencies so the cooperative loop can
 * be exercised headlessly: the two input axes are ordinary numbers, and each
 * fixed step returns the events the presentation layer turns into sound.
 */
import {
	ATTACH_DISTANCE,
	ATTACH_HEIGHT,
	ATTACH_SPEED,
	BEAM_MAX_X,
	BEAM_MIN_X,
	BEAM_SPEED,
	CRATE_RADIUS,
	CRATE_SIZE,
	CRATE_SPECS,
	HIT_SOUND_INTERVAL,
	HOIST_MAX,
	HOIST_MIN,
	HOIST_SPEED,
	HOOK_RADIUS,
	MAX_DURABILITY,
	PIPE_DAMAGE_PER_SECOND,
	PIPE_HOOK_RADIUS,
	PIPES,
	PLACE_DISTANCE,
	PLACE_HEIGHT,
	PLACE_SPEED,
	RUN_SECONDS,
	SLOT_HEIGHT,
	SLOT_WIDTH,
	SLOT_X,
	SLOT_Y,
	TROLLEY_MAX_Y,
	TROLLEY_MIN_Y,
	TROLLEY_SPEED,
	YARD,
} from "./constants";

export type RunPhase = "playing" | "won" | "failed";
export type FailReason = "time" | "durability" | null;
export type SimEventType =
	| "latch"
	| "place"
	| "collision"
	| "win"
	| "fail"
	| "restart";

export interface Controls {
	/** -1 moves the bridge left, +1 right. */
	beam: number;
	/** -1 moves the trolley forward (up-screen), +1 backward. */
	trolley: number;
	/** -1 lowers the hook, +1 raises it. */
	hoist: number;
}

export interface SimEvent {
	type: SimEventType;
	crateIndex?: number;
	reason?: Exclude<FailReason, null>;
}

export interface CrateState {
	index: number;
	label: string;
	color: string;
	weight: number;
	pickupX: number;
	pickupY: number;
	targetSlot: number;
	x: number;
	y: number;
	placed: boolean;
}

export interface SlotState {
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
	crateIndex: number | null;
}

const ZERO_CONTROLS: Controls = { beam: 0, trolley: 0, hoist: 0 };

function clamp(value: number, low: number, high: number): number {
	return value < low ? low : value > high ? high : value;
}

function damp(
	current: number,
	target: number,
	lambda: number,
	dtSeconds: number,
): number {
	return target + (current - target) * Math.exp(-lambda * dtSeconds);
}

function pointToSegmentSq(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const abx = bx - ax;
	const aby = by - ay;
	const lengthSq = abx * abx + aby * aby;
	const t =
		lengthSq === 0
			? 0
			: clamp(((px - ax) * abx + (py - ay) * aby) / lengthSq, 0, 1);
	const dx = px - (ax + abx * t);
	const dy = py - (ay + aby * t);
	return dx * dx + dy * dy;
}

export class CraneSimulation {
	beamX = 190;
	beamSpeed = 0;
	trolleyY = 604;
	trolleySpeed = 0;
	hoistZ = 0.66;
	hoistSpeed = 0;

	hookX = 190;
	hookY = 604;
	hookVX = 0;
	hookVY = 0;

	phase: RunPhase = "playing";
	failReason: FailReason = null;
	timeLeft = RUN_SECONDS;
	runTime = 0;
	durability = MAX_DURABILITY;
	placedCount = 0;
	carriedIndex: number | null = null;

	hitFlash = 0;
	placeFlash = 0;
	pipeWarning = false;
	clearanceBlocked = false;

	readonly crates: CrateState[];
	readonly slots: SlotState[];
	private readonly events: SimEvent[] = [];
	private hitSoundTimer = 0;

	constructor() {
		this.crates = CRATE_SPECS.map((spec, index) => ({
			index,
			label: spec.label,
			color: spec.color,
			weight: spec.weight,
			pickupX: spec.pickupX,
			pickupY: spec.pickupY,
			targetSlot: spec.targetSlot,
			x: spec.pickupX,
			y: spec.pickupY,
			placed: false,
		}));
		this.slots = SLOT_X.map((x, index) => ({
			index,
			x,
			y: SLOT_Y,
			width: SLOT_WIDTH,
			height: SLOT_HEIGHT,
			crateIndex: null,
		}));
	}

	get carriedCrate(): CrateState | null {
		return this.carriedIndex === null ? null : this.crates[this.carriedIndex];
	}

	get loadX(): number {
		return this.carriedIndex === null
			? this.hookX
			: this.crates[this.carriedIndex].x;
	}

	get loadY(): number {
		return this.carriedIndex === null
			? this.hookY
			: this.crates[this.carriedIndex].y;
	}

	get loadRadius(): number {
		return this.carriedIndex === null ? HOOK_RADIUS : CRATE_RADIUS;
	}

	get hookSpeed(): number {
		return Math.sqrt(this.hookVX * this.hookVX + this.hookVY * this.hookVY);
	}

	get loadMass(): number {
		return this.carriedCrate?.weight ?? 1;
	}

	step(dtMs: number, controls: Controls = ZERO_CONTROLS): void {
		if (this.phase !== "playing") {
			this.hitFlash = Math.max(0, this.hitFlash - dtMs / 1000);
			this.placeFlash = Math.max(0, this.placeFlash - dtMs / 1000);
			return;
		}

		// A tab-switch can hand the engine a very large dt. Keep the spring
		// stable and the run fair by capping a single simulation step.
		const dt = Math.min(dtMs / 1000, 0.05);
		this.runTime += dt;
		this.timeLeft = Math.max(0, this.timeLeft - dt);
		this.hitFlash = Math.max(0, this.hitFlash - dt);
		this.placeFlash = Math.max(0, this.placeFlash - dt);

		this.stepCarriage(dt, controls);
		this.stepHook(dt);
		this.stepInteraction();
		this.stepPipes(dt);

		if (this.durability <= 0) {
			this.fail("durability");
		} else if (this.timeLeft <= 0) {
			this.fail("time");
		}
	}

	private stepCarriage(dt: number, controls: Controls): void {
		const mass = this.loadMass;
		const beamInput = clamp(controls.beam, -1, 1);
		const trolleyInput = clamp(controls.trolley, -1, 1);
		const hoistInput = clamp(controls.hoist, -1, 1);

		const beamTarget = (beamInput * BEAM_SPEED) / (0.9 + mass * 0.1);
		const beamLambda = beamInput === 0 ? 2.9 + mass : 4.8 / mass;
		this.beamSpeed = damp(this.beamSpeed, beamTarget, beamLambda, dt);
		this.beamX += this.beamSpeed * dt;
		if (
			(this.beamX <= BEAM_MIN_X && this.beamSpeed < 0) ||
			(this.beamX >= BEAM_MAX_X && this.beamSpeed > 0)
		) {
			this.beamSpeed = 0;
		}
		this.beamX = clamp(this.beamX, BEAM_MIN_X, BEAM_MAX_X);

		const trolleyTarget = (trolleyInput * TROLLEY_SPEED) / (0.88 + mass * 0.12);
		const trolleyLambda = trolleyInput === 0 ? 3.1 + mass * 1.1 : 5.4 / mass;
		this.trolleySpeed = damp(
			this.trolleySpeed,
			trolleyTarget,
			trolleyLambda,
			dt,
		);
		this.trolleyY += this.trolleySpeed * dt;
		if (
			(this.trolleyY <= TROLLEY_MIN_Y && this.trolleySpeed < 0) ||
			(this.trolleyY >= TROLLEY_MAX_Y && this.trolleySpeed > 0)
		) {
			this.trolleySpeed = 0;
		}
		this.trolleyY = clamp(this.trolleyY, TROLLEY_MIN_Y, TROLLEY_MAX_Y);

		const hoistTarget = (hoistInput * HOIST_SPEED) / (0.72 + mass * 0.28);
		const hoistLambda = 9.5 / (0.8 + mass * 0.2);
		this.hoistSpeed = damp(this.hoistSpeed, hoistTarget, hoistLambda, dt);
		this.hoistZ += this.hoistSpeed * dt;
		if (
			(this.hoistZ <= HOIST_MIN && this.hoistSpeed < 0) ||
			(this.hoistZ >= HOIST_MAX && this.hoistSpeed > 0)
		) {
			this.hoistSpeed = 0;
		}
		this.hoistZ = clamp(this.hoistZ, HOIST_MIN, HOIST_MAX);
	}

	private stepHook(dt: number): void {
		const mass = this.loadMass;
		const omega = 7.4 / Math.sqrt(mass);
		const zeta = 0.5 / mass;
		const anchorX = this.beamX;
		const anchorY = this.trolleyY;

		const ax =
			omega * omega * (anchorX - this.hookX) - 2 * zeta * omega * this.hookVX;
		const ay =
			omega * omega * (anchorY - this.hookY) - 2 * zeta * omega * this.hookVY;
		this.hookVX += ax * dt;
		this.hookVY += ay * dt;
		this.hookX += this.hookVX * dt;
		this.hookY += this.hookVY * dt;

		const minX = YARD.left + CRATE_SIZE / 2;
		const maxX = YARD.right - CRATE_SIZE / 2;
		const minY = YARD.top + CRATE_SIZE / 2;
		const maxY = YARD.bottom - CRATE_SIZE / 2;
		if (this.hookX < minX || this.hookX > maxX) {
			this.hookX = clamp(this.hookX, minX, maxX);
			this.hookVX *= -0.18;
		}
		if (this.hookY < minY || this.hookY > maxY) {
			this.hookY = clamp(this.hookY, minY, maxY);
			this.hookVY *= -0.18;
		}

		const carried = this.carriedCrate;
		if (carried !== null) {
			carried.x = this.hookX;
			carried.y = this.hookY;
		}
	}

	private stepInteraction(): void {
		if (this.carriedIndex === null) {
			if (this.hoistZ <= ATTACH_HEIGHT && this.hookSpeed <= ATTACH_SPEED) {
				for (const crate of this.crates) {
					if (crate.placed) {
						continue;
					}
					const dx = crate.x - this.hookX;
					const dy = crate.y - this.hookY;
					if (Math.hypot(dx, dy) <= ATTACH_DISTANCE) {
						this.carriedIndex = crate.index;
						crate.x = this.hookX;
						crate.y = this.hookY;
						this.events.push({
							type: "latch",
							crateIndex: crate.index,
						});
						break;
					}
				}
			}
			return;
		}

		const crate = this.crates[this.carriedIndex];
		const slot = this.slots[crate.targetSlot];
		if (
			this.hoistZ <= PLACE_HEIGHT &&
			this.hookSpeed <= PLACE_SPEED &&
			slot.crateIndex === null &&
			Math.hypot(slot.x - crate.x, slot.y - crate.y) <= PLACE_DISTANCE
		) {
			crate.x = slot.x;
			crate.y = slot.y;
			crate.placed = true;
			slot.crateIndex = crate.index;
			this.carriedIndex = null;
			this.placedCount++;
			this.placeFlash = 1.2;
			this.events.push({ type: "place", crateIndex: crate.index });
			if (this.placedCount === this.crates.length) {
				this.win();
			}
		}
	}

	private stepPipes(dt: number): void {
		const loadX = this.loadX;
		const loadY = this.loadY;
		const radius = this.loadRadius + PIPE_HOOK_RADIUS;
		let colliding = false;
		let warning = false;
		let blocked = false;

		for (const pipe of PIPES) {
			for (let i = 0; i < pipe.points.length - 1; i++) {
				const a = pipe.points[i];
				const b = pipe.points[i + 1];
				const near = pointToSegmentSq(loadX, loadY, a.x, a.y, b.x, b.y);
				if (near <= radius * radius) {
					if (this.hoistZ < pipe.clearance + 0.07) {
						colliding = true;
						warning = true;
						blocked = true;
					} else {
						warning = true;
					}
				}
			}
		}

		this.pipeWarning = warning;
		this.clearanceBlocked = blocked;
		if (!colliding) {
			this.hitSoundTimer = Math.max(0, this.hitSoundTimer - dt);
			return;
		}

		this.durability = Math.max(
			0,
			this.durability - PIPE_DAMAGE_PER_SECOND * dt,
		);
		this.hitFlash = Math.max(this.hitFlash, 0.22);
		this.hitSoundTimer -= dt;
		if (this.hitSoundTimer <= 0) {
			this.hitSoundTimer = HIT_SOUND_INTERVAL;
			this.events.push({ type: "collision" });
		}
	}

	private fail(reason: Exclude<FailReason, null>): void {
		if (this.phase !== "playing") {
			return;
		}
		this.phase = "failed";
		this.failReason = reason;
		this.events.push({ type: "fail", reason });
	}

	private win(): void {
		if (this.phase !== "playing") {
			return;
		}
		this.phase = "won";
		this.events.push({ type: "win" });
	}

	restart(): void {
		this.beamX = 190;
		this.beamSpeed = 0;
		this.trolleyY = 604;
		this.trolleySpeed = 0;
		this.hoistZ = 0.66;
		this.hoistSpeed = 0;
		this.hookX = this.beamX;
		this.hookY = this.trolleyY;
		this.hookVX = 0;
		this.hookVY = 0;
		this.phase = "playing";
		this.failReason = null;
		this.timeLeft = RUN_SECONDS;
		this.runTime = 0;
		this.durability = MAX_DURABILITY;
		this.placedCount = 0;
		this.carriedIndex = null;
		this.hitFlash = 0;
		this.placeFlash = 0;
		this.pipeWarning = false;
		this.clearanceBlocked = false;
		for (const crate of this.crates) {
			crate.x = crate.pickupX;
			crate.y = crate.pickupY;
			crate.placed = false;
		}
		for (const slot of this.slots) {
			slot.crateIndex = null;
		}
		this.events.length = 0;
		this.events.push({ type: "restart" });
	}

	/**
	 * Hand the accumulated one-shot events to the presentation layer.
	 * The array is cleared in place, so callers never own simulation state.
	 */
	takeEvents(): SimEvent[] {
		if (this.events.length === 0) {
			return [];
		}
		const result = this.events.slice();
		this.events.length = 0;
		return result;
	}
}
