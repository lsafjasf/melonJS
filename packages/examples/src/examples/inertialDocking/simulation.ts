/**
 * melonJS — Inertial Docking: deterministic flight and contact model.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	BERTH_APERTURE,
	BERTH_LAYOUT,
	BERTH_RADIUS,
	BERTH_WALL,
	BOOST_MAX_SPEED,
	BOOST_MULTIPLIER,
	DOCK_ANGLE,
	DOCK_ANGULAR_SPEED,
	DOCK_RADIUS,
	DOCK_SPEED,
	FIXED_SEED,
	HULL_MAX,
	INITIAL_FUEL,
	LATERAL_ACCEL,
	MAIN_ACCEL,
	MAIN_BURN,
	MAX_ANGULAR_SPEED,
	MAX_SPEED,
	RCS_BURN,
	RECOVERY,
	RECOVERY_ANGLE,
	RECOVERY_ANGULAR_SPEED,
	RECOVERY_CAPTURE_RADIUS,
	RECOVERY_HEADING,
	RECOVERY_SPEED,
	REVERSE_ACCEL,
	ROTATION_ACCEL,
	ROTATION_BURN,
	SHIP_RADIUS,
	START,
	TAU,
	VIEWPORT_H,
	VIEWPORT_W,
} from "./constants";

export type GamePhase = "running" | "success" | "failed";

export interface FlightInput {
	forward: boolean;
	reverse: boolean;
	strafeLeft: boolean;
	strafeRight: boolean;
	rotateLeft: boolean;
	rotateRight: boolean;
	boost: boolean;
}

export interface ThrusterState {
	main: number;
	reverse: number;
	left: number;
	right: number;
	rotateLeft: number;
	rotateRight: number;
	boost: boolean;
}

export interface ShipState {
	x: number;
	y: number;
	vx: number;
	vy: number;
	angle: number;
	angularVelocity: number;
	hull: number;
	fuel: number;
}

export interface BerthState {
	id: string;
	x: number;
	y: number;
	radius: number;
	angle: number;
	spin: number;
	secured: boolean;
	securedAt: number;
}

export interface GameEvent {
	type: "dock" | "impact" | "recovery" | "failed" | "boundary" | "fuel-empty";
	berth?: number;
	force?: number;
	damage?: number;
	x?: number;
	y?: number;
}

export interface GameState {
	seed: number;
	elapsed: number;
	ship: ShipState;
	berths: BerthState[];
	nextBerth: number;
	phase: GamePhase;
	thrusters: ThrusterState;
	impactFlash: number;
	dockFlash: number;
	fuelEmptyAnnounced: boolean;
	lastImpact: number;
}

export interface DockingMetrics {
	target: BerthState | undefined;
	range: number;
	closingSpeed: number;
	speed: number;
	heading: number;
	headingError: number;
	angularSpeed: number;
	fuelEmpty: boolean;
}

export const IDLE_INPUT: FlightInput = {
	forward: false,
	reverse: false,
	strafeLeft: false,
	strafeRight: false,
	rotateLeft: false,
	rotateRight: false,
	boost: false,
};

const EPSILON = 0.000001;

/** A tiny deterministic PRNG, so the mission and the starfield never drift. */
export function mulberry32(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

/** Shortest signed difference between two angles, in `[-π, π]`. */
export function wrapAngle(angle: number): number {
	let wrapped = angle % TAU;
	if (wrapped > Math.PI) {
		wrapped -= TAU;
	} else if (wrapped < -Math.PI) {
		wrapped += TAU;
	}
	return wrapped;
}

export function speedOf(ship: ShipState): number {
	return Math.hypot(ship.vx, ship.vy);
}

export function currentBerth(state: GameState): BerthState | undefined {
	return state.berths[state.nextBerth];
}

export function createGameState(seed = FIXED_SEED): GameState {
	const random = mulberry32(seed);
	const spins: number[] = [];
	const berths: BerthState[] = [];

	for (const [index, layout] of BERTH_LAYOUT.entries()) {
		let spin = 0;
		for (let attempt = 0; attempt < 20; attempt++) {
			const candidate = 0.27 + random() * 0.34;
			const signed = random() < 0.5 ? -candidate : candidate;
			if (
				spins.every((other) => Math.abs(Math.abs(other) - candidate) > 0.055)
			) {
				spin = signed;
				break;
			}
		}
		if (spin === 0) {
			spin = (index % 2 === 0 ? 1 : -1) * (0.31 + index * 0.13);
		}
		spins.push(spin);
		berths.push({
			id: layout.id,
			x: layout.x,
			y: layout.y,
			radius: BERTH_RADIUS,
			angle: random() * TAU,
			spin,
			secured: false,
			securedAt: -1,
		});
	}

	return {
		seed,
		elapsed: 0,
		ship: {
			x: START.x,
			y: START.y,
			vx: 22,
			vy: 0,
			angle: 0,
			angularVelocity: 0,
			hull: HULL_MAX,
			fuel: INITIAL_FUEL,
		},
		berths,
		nextBerth: 0,
		phase: "running",
		thrusters: {
			main: 0,
			reverse: 0,
			left: 0,
			right: 0,
			rotateLeft: 0,
			rotateRight: 0,
			boost: false,
		},
		impactFlash: 0,
		dockFlash: 0,
		fuelEmptyAnnounced: false,
		lastImpact: 0,
	};
}

export function dockingMetrics(state: GameState): DockingMetrics {
	const target = currentBerth(state);
	const ship = state.ship;
	const speed = speedOf(ship);
	if (target === undefined) {
		const dx = RECOVERY.x - ship.x;
		const dy = RECOVERY.y - ship.y;
		const range = Math.hypot(dx, dy);
		const closingSpeed =
			range > EPSILON ? (dx * ship.vx + dy * ship.vy) / range : 0;
		return {
			target: undefined,
			range,
			closingSpeed,
			speed,
			heading: RECOVERY_HEADING,
			headingError: Math.abs(wrapAngle(ship.angle - RECOVERY_HEADING)),
			angularSpeed: Math.abs(ship.angularVelocity),
			fuelEmpty: ship.fuel <= EPSILON,
		};
	}
	const dx = target.x - ship.x;
	const dy = target.y - ship.y;
	const range = Math.hypot(dx, dy);
	const closingSpeed =
		range > EPSILON ? (dx * ship.vx + dy * ship.vy) / range : 0;
	const inwardHeading = target.angle + Math.PI;
	return {
		target,
		range,
		closingSpeed,
		speed,
		heading: inwardHeading,
		headingError: Math.abs(wrapAngle(ship.angle - inwardHeading)),
		angularSpeed: Math.abs(ship.angularVelocity),
		fuelEmpty: ship.fuel <= EPSILON,
	};
}

function applyThrusters(
	state: GameState,
	input: FlightInput,
	dt: number,
	events: GameEvent[],
): void {
	const ship = state.ship;
	const canBurn = ship.fuel > 0 && state.phase === "running";
	const thrusting = canBurn
		? {
				main: input.forward ? 1 : 0,
				reverse: input.reverse ? 1 : 0,
				left: input.strafeLeft ? 1 : 0,
				right: input.strafeRight ? 1 : 0,
				rotateLeft: input.rotateLeft ? 1 : 0,
				rotateRight: input.rotateRight ? 1 : 0,
				boost: input.boost,
			}
		: {
				main: 0,
				reverse: 0,
				left: 0,
				right: 0,
				rotateLeft: 0,
				rotateRight: 0,
				boost: false,
			};
	state.thrusters = thrusting;

	let burn = 0;
	if (thrusting.main > 0 || thrusting.reverse > 0) {
		burn += MAIN_BURN * (thrusting.boost ? BOOST_MULTIPLIER : 1);
	}
	if (thrusting.left > 0 || thrusting.right > 0) {
		burn += RCS_BURN;
	}
	if (thrusting.rotateLeft > 0 || thrusting.rotateRight > 0) {
		burn += ROTATION_BURN;
	}
	if (burn > 0) {
		ship.fuel = Math.max(0, ship.fuel - burn * dt);
	}

	const cos = Math.cos(ship.angle);
	const sin = Math.sin(ship.angle);
	const forward = thrusting.main - thrusting.reverse;
	const lateral = thrusting.right - thrusting.left;
	const rotation = thrusting.rotateRight - thrusting.rotateLeft;
	const boost = thrusting.boost ? BOOST_MULTIPLIER : 1;
	const speedLimit = thrusting.boost ? BOOST_MAX_SPEED : MAX_SPEED;

	if (forward !== 0 && speedOf(ship) < speedLimit) {
		const acceleration =
			(forward > 0 ? MAIN_ACCEL : REVERSE_ACCEL) * boost * forward;
		ship.vx += cos * acceleration * dt;
		ship.vy += sin * acceleration * dt;
	}
	if (lateral !== 0) {
		ship.vx += -sin * LATERAL_ACCEL * lateral * dt;
		ship.vy += cos * LATERAL_ACCEL * lateral * dt;
	}
	if (rotation !== 0 && Math.abs(ship.angularVelocity) < MAX_ANGULAR_SPEED) {
		ship.angularVelocity += ROTATION_ACCEL * rotation * dt;
		ship.angularVelocity = Math.max(
			-MAX_ANGULAR_SPEED,
			Math.min(MAX_ANGULAR_SPEED, ship.angularVelocity),
		);
	}

	if (ship.fuel <= 0 && !state.fuelEmptyAnnounced) {
		state.fuelEmptyAnnounced = true;
		events.push({ type: "fuel-empty" });
	}
}

function bounceAtBoundary(state: GameState, events: GameEvent[]): void {
	const ship = state.ship;
	const margin = 17;
	let bounced = false;
	if (ship.x < margin) {
		ship.x = margin;
		if (ship.vx < 0) {
			ship.vx = -ship.vx * 0.32;
			bounced = true;
		}
	} else if (ship.x > VIEWPORT_W - margin) {
		ship.x = VIEWPORT_W - margin;
		if (ship.vx > 0) {
			ship.vx = -ship.vx * 0.32;
			bounced = true;
		}
	}
	if (ship.y < margin) {
		ship.y = margin;
		if (ship.vy < 0) {
			ship.vy = -ship.vy * 0.32;
			bounced = true;
		}
	} else if (ship.y > VIEWPORT_H - margin) {
		ship.y = VIEWPORT_H - margin;
		if (ship.vy > 0) {
			ship.vy = -ship.vy * 0.32;
			bounced = true;
		}
	}
	if (bounced) {
		state.impactFlash = Math.max(state.impactFlash, 0.16);
		events.push({ type: "boundary" });
	}
}

function collideBerths(state: GameState, events: GameEvent[]): void {
	const ship = state.ship;

	for (const berth of state.berths) {
		const dx = ship.x - berth.x;
		const dy = ship.y - berth.y;
		const distance = Math.hypot(dx, dy);
		if (distance < EPSILON) {
			continue;
		}

		const angle = Math.atan2(dy, dx);
		const opening = Math.abs(wrapAngle(angle - berth.angle));
		if (opening < BERTH_APERTURE) {
			continue;
		}

		const band = SHIP_RADIUS + BERTH_WALL * 0.5;
		if (Math.abs(distance - berth.radius) >= band) {
			continue;
		}

		const outward = distance >= berth.radius ? 1 : -1;
		const nx = (dx / distance) * outward;
		const ny = (dy / distance) * outward;
		const normalSpeed = ship.vx * nx + ship.vy * ny;
		const impactSpeed = Math.max(0, -normalSpeed);

		ship.vx -= 1.28 * normalSpeed * nx;
		ship.vy -= 1.28 * normalSpeed * ny;
		ship.vx *= 0.9;
		ship.vy *= 0.9;

		const resolvedDistance =
			outward > 0 ? berth.radius + band + 0.8 : berth.radius - band - 0.8;
		ship.x = berth.x + (dx / distance) * resolvedDistance;
		ship.y = berth.y + (dy / distance) * resolvedDistance;

		const damage = Math.max(0, impactSpeed - 12) * 0.9;
		state.impactFlash = Math.max(
			state.impactFlash,
			Math.min(1, impactSpeed / 180),
		);
		if (damage > 0) {
			ship.hull = Math.max(0, ship.hull - damage);
			state.lastImpact = impactSpeed;
			events.push({
				type: "impact",
				berth: state.berths.indexOf(berth),
				force: impactSpeed,
				damage,
				x: ship.x,
				y: ship.y,
			});
			if (ship.hull <= 0) {
				state.phase = "failed";
				events.push({ type: "failed" });
				return;
			}
		}
	}
}

function tryDock(state: GameState, events: GameEvent[]): void {
	const target = currentBerth(state);
	if (target === undefined || target.secured || state.phase !== "running") {
		return;
	}

	const ship = state.ship;
	const dx = target.x - ship.x;
	const dy = target.y - ship.y;
	if (Math.hypot(dx, dy) > DOCK_RADIUS) {
		return;
	}

	const speed = speedOf(ship);
	const desiredHeading = target.angle + Math.PI;
	const headingError = Math.abs(wrapAngle(ship.angle - desiredHeading));
	if (
		speed <= DOCK_SPEED &&
		headingError <= DOCK_ANGLE &&
		Math.abs(ship.angularVelocity) <= DOCK_ANGULAR_SPEED
	) {
		target.secured = true;
		target.securedAt = state.elapsed;
		state.nextBerth++;
		state.dockFlash = 1;
		events.push({ type: "dock", berth: state.nextBerth - 1 });
	}
}

function tryRecovery(state: GameState, events: GameEvent[]): void {
	if (state.nextBerth < state.berths.length || state.phase !== "running") {
		return;
	}

	const ship = state.ship;
	const distance = Math.hypot(RECOVERY.x - ship.x, RECOVERY.y - ship.y);
	if (distance > RECOVERY_CAPTURE_RADIUS) {
		return;
	}

	if (
		speedOf(ship) <= RECOVERY_SPEED &&
		Math.abs(wrapAngle(ship.angle - RECOVERY_HEADING)) <= RECOVERY_ANGLE &&
		Math.abs(ship.angularVelocity) <= RECOVERY_ANGULAR_SPEED
	) {
		state.phase = "success";
		state.dockFlash = 1;
		events.push({ type: "recovery" });
	}
}

/**
 * Advance the mission by `dt` seconds. There is deliberately no linear or
 * angular drag: releasing a control leaves the current velocity intact.
 */
export function stepGame(
	state: GameState,
	input: FlightInput,
	dt: number,
): GameEvent[] {
	const events: GameEvent[] = [];
	const step = Math.max(0, dt);
	if (step === 0) {
		return events;
	}

	state.elapsed += step;
	for (const berth of state.berths) {
		berth.angle = wrapAngle(berth.angle + berth.spin * step);
	}

	applyThrusters(state, input, step, events);

	const ship = state.ship;
	ship.angle = wrapAngle(ship.angle + ship.angularVelocity * step);
	ship.x += ship.vx * step;
	ship.y += ship.vy * step;

	bounceAtBoundary(state, events);
	collideBerths(state, events);
	tryDock(state, events);
	tryRecovery(state, events);

	state.impactFlash = Math.max(0, state.impactFlash - step * 2.6);
	state.dockFlash = Math.max(0, state.dockFlash - step * 1.8);
	return events;
}

export function bleedsFuel(state: GameState): boolean {
	return (
		state.ship.fuel > 0 && state.thrusters.main + state.thrusters.reverse > 0
	);
}
