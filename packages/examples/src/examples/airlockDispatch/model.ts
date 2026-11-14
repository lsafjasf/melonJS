/**
 * melonJS — Airlock Dispatch example: deterministic dispatch simulation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The model owns no drawing and no engine state, so a complete run, a
 * pause-and-reassign, and every failure can be exercised independently.
 */

export type CargoKind = "oxygen" | "medical" | "energy" | "supply";
export type DispatchPhase = "planning" | "running" | "won" | "failed";
export type ElevatorMode = "idle" | "moving" | "docked" | "opening";

export interface CargoDefinition {
	id: string;
	code: string;
	kind: CargoKind;
	deck: number;
	deadline: number;
}

export interface CargoState extends CargoDefinition {
	status: "pending" | "queued" | "complete";
	remaining: number;
	completedAt: number | null;
}

export interface ElevatorState {
	id: number;
	label: string;
	deck: number;
	fromDeck: number;
	targetDeck: number | null;
	mode: ElevatorMode;
	activeTaskId: string | null;
	route: (string | null)[];
	stateTimer: number;
}

export interface DoorState {
	deck: number;
	pressure: number;
	openTimer: number;
	announcedSafe: boolean;
}

export interface FailureState {
	kind: "power" | "timeout" | "decompression";
	message: string;
	taskId?: string;
	deck?: number;
}

export type DispatchEvent =
	| { type: "move"; elevator: number; fromDeck: number; toDeck: number }
	| { type: "dock"; elevator: number; deck: number }
	| { type: "open"; deck: number; taskId: string }
	| { type: "safe"; deck: number }
	| { type: "fail"; failure: FailureState }
	| { type: "win" };

export interface OpenResult {
	ok: boolean;
	reason?: string;
	failed?: boolean;
}

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 800;
export const DECK_COUNT = 5;
export const ELEVATOR_COUNT = 3;
export const ROUTE_SLOTS = 3;
export const TOTAL_CARGO = 8;

export const STARTING_POWER = 75;
export const IDLE_DRAIN = 0.16;
export const MOVE_BASE_COST = 2.2;
export const MOVE_DISTANCE_COST = 4.2;
export const DOOR_COST = 2.2;
export const OPENING_TIME = 0.55;
export const PRESSURE_SAFE = 100;
export const PRESSURE_AFTER_OPEN = 24;
export const PRESSURE_RECOVERY = 3.8;
export const ELEVATOR_SPEED = 0.8;

export const ELEVATOR_START_DECKS = [1, 3, 5] as const;

export const CARGO_DEFINITIONS: readonly CargoDefinition[] = [
	{ id: "o2-01", code: "O2-01", kind: "oxygen", deck: 2, deadline: 24 },
	{ id: "o2-02", code: "O2-02", kind: "oxygen", deck: 4, deadline: 30 },
	{ id: "med-01", code: "MED-01", kind: "medical", deck: 1, deadline: 38 },
	{ id: "med-02", code: "MED-02", kind: "medical", deck: 5, deadline: 46 },
	{ id: "pwr-01", code: "PWR-01", kind: "energy", deck: 2, deadline: 74 },
	{ id: "pwr-02", code: "PWR-02", kind: "energy", deck: 3, deadline: 86 },
	{ id: "sup-01", code: "SUP-01", kind: "supply", deck: 3, deadline: 108 },
	{ id: "sup-02", code: "SUP-02", kind: "supply", deck: 4, deadline: 120 },
];

export const CARGO_STYLE: Record<
	CargoKind,
	{ label: string; color: string; priority: number; glyph: string }
> = {
	oxygen: { label: "OXYGEN", color: "#58d6ff", priority: 3, glyph: "O2" },
	medical: { label: "MEDICAL", color: "#ff8aa5", priority: 2, glyph: "MED" },
	energy: { label: "ENERGY", color: "#ffd166", priority: 1, glyph: "PWR" },
	supply: { label: "SUPPLY", color: "#9fb0c3", priority: 0, glyph: "SUP" },
};

/**
 * Build the initial cargo set. Kept as a function so every reset gets
 * independent objects rather than sharing mutable state.
 * @returns the eight pending cargo pods
 */
function createCargo(): CargoState[] {
	return CARGO_DEFINITIONS.map((definition) => {
		return {
			...definition,
			status: "pending",
			remaining: definition.deadline,
			completedAt: null,
		};
	});
}

/**
 * Build the initial lift and door state.
 * @returns the three lifts and five pressure doors
 */
function createEquipment(): {
	elevators: ElevatorState[];
	doors: DoorState[];
} {
	const elevators = ELEVATOR_START_DECKS.map((deck, index) => {
		return {
			id: index,
			label: String.fromCharCode(65 + index),
			deck,
			fromDeck: deck,
			targetDeck: null,
			mode: "idle" as ElevatorMode,
			activeTaskId: null,
			route: Array<string | null>(ROUTE_SLOTS).fill(null),
			stateTimer: 0,
		};
	});
	const doors = Array.from({ length: DECK_COUNT }, (_, index) => {
		return {
			deck: index + 1,
			pressure: PRESSURE_SAFE,
			openTimer: 0,
			announcedSafe: true,
		};
	});
	return { elevators, doors };
}

/**
 * The complete airlock dispatch game state and rules.
 */
export class DispatchModel {
	phase: DispatchPhase = "planning";
	paused = false;
	elapsed = 0;
	power = STARTING_POWER;
	cargo: CargoState[] = [];
	elevators: ElevatorState[] = [];
	doors: DoorState[] = [];
	failure: FailureState | null = null;
	events: DispatchEvent[] = [];

	constructor() {
		this.reset();
	}

	/**
	 * Return the game to its exact opening state.
	 */
	reset(): void {
		const { elevators, doors } = createEquipment();
		this.phase = "planning";
		this.paused = false;
		this.elapsed = 0;
		this.power = STARTING_POWER;
		this.cargo = createCargo();
		this.elevators = elevators;
		this.doors = doors;
		this.failure = null;
		this.events = [];
	}

	/**
	 * Route editing is legal while planning, or while a running game is
	 * paused. It is deliberately frozen during live dispatch.
	 * @returns whether the routes can currently be changed
	 */
	get editable(): boolean {
		return (
			this.phase === "planning" || (this.phase === "running" && this.paused)
		);
	}

	/**
	 * The number of pods currently placed on a lift route.
	 * @returns how many of the eight pods are committed
	 */
	get assignedCount(): number {
		return this.elevators.reduce((count, elevator) => {
			return (
				count +
				elevator.route.reduce((slotCount, taskId) => {
					return slotCount + (taskId === null ? 0 : 1);
				}, 0)
			);
		}, 0);
	}

	/**
	 * The number of pods already delivered.
	 * @returns how many pods have completed their pressure cycle
	 */
	get completedCount(): number {
		return this.cargo.filter((task) => {
			return task.status === "complete";
		}).length;
	}

	/**
	 * Find a pod by id.
	 * @param taskId - the pod's stable id
	 * @returns the pod state
	 */
	getCargo(taskId: string): CargoState | undefined {
		return this.cargo.find((task) => {
			return task.id === taskId;
		});
	}

	/**
	 * The pod in one lift route slot, if any.
	 * @param elevatorIndex - lift index 0..2
	 * @param slotIndex - route position 0..2
	 * @returns the pod state, or undefined
	 */
	getRouteTask(
		elevatorIndex: number,
		slotIndex: number,
	): CargoState | undefined {
		const taskId = this.elevators[elevatorIndex]?.route[slotIndex];
		return taskId ? this.getCargo(taskId) : undefined;
	}

	/**
	 * Drain the events produced since the last call.
	 * @returns the queued presentation events
	 */
	drainEvents(): DispatchEvent[] {
		const queued = this.events;
		this.events = [];
		return queued;
	}

	/**
	 * Place a pending pod into one exact lift route position.
	 * @param taskId - the pending pod
	 * @param elevatorIndex - lift index 0..2
	 * @param slotIndex - execution position 0..2
	 * @returns whether the assignment was accepted
	 */
	assign(taskId: string, elevatorIndex: number, slotIndex: number): boolean {
		if (!this.editable) return false;
		const task = this.getCargo(taskId);
		const elevator = this.elevators[elevatorIndex];
		if (!task || !elevator || task.status !== "pending") return false;
		if (slotIndex < 0 || slotIndex >= ROUTE_SLOTS) return false;
		if (elevator.route[slotIndex] !== null) return false;
		elevator.route[slotIndex] = taskId;
		task.status = "queued";
		return true;
	}

	/**
	 * Take a pod back off a route. Completed cargo cannot be moved.
	 * @param elevatorIndex - lift index 0..2
	 * @param slotIndex - route position 0..2
	 * @returns the pod returned to the pending queue, if any
	 */
	unassign(elevatorIndex: number, slotIndex: number): CargoState | undefined {
		if (!this.editable) return undefined;
		const elevator = this.elevators[elevatorIndex];
		if (!elevator) return undefined;
		const taskId = elevator.route[slotIndex];
		const task = taskId ? this.getCargo(taskId) : undefined;
		if (!task || task.status === "complete") return undefined;
		elevator.route[slotIndex] = null;
		task.status = "pending";
		if (elevator.activeTaskId === task.id) {
			elevator.activeTaskId = null;
			elevator.targetDeck = null;
			elevator.mode = "idle";
		}
		return task;
	}

	/**
	 * Begin dispatch. Every pod must be committed, so no route slot can be
	 * left with cargo that never gets a chance to make its window.
	 * @returns whether the launch was accepted
	 */
	launch(): boolean {
		if (this.phase !== "planning" || this.assignedCount !== TOTAL_CARGO) {
			return false;
		}
		this.phase = "running";
		this.paused = false;
		this.elapsed = 0;
		for (const task of this.cargo) {
			task.remaining = task.deadline;
		}
		return true;
	}

	/**
	 * Freeze or resume the simulation. Physics-free timing is handled by the
	 * board, which stops calling `tick()` while paused.
	 * @param paused - the new pause state
	 */
	setPaused(paused: boolean): void {
		if (this.phase !== "running") return;
		this.paused = paused;
	}

	/**
	 * Advance the real-time dispatch simulation.
	 * @param dt - elapsed seconds since the previous simulation step
	 */
	tick(dt: number): void {
		if (this.phase !== "running" || this.paused) return;
		const step = Math.max(0, Math.min(dt, 0.1));
		if (step === 0) return;

		this.elapsed += step;
		this.power -= IDLE_DRAIN * step;
		this.updateDoors(step);
		this.updateCargo(step);
		if (this.phase !== "running") return;
		this.updateElevators(step);
		if (this.phase !== "running") return;

		if (this.completedCount === this.cargo.length) {
			this.win();
		} else if (this.power <= 0) {
			this.power = 0;
			this.fail({
				kind: "power",
				message: "BASE POWER DEPLETED",
			});
		}
	}

	/**
	 * Recover every closed door toward a safe pressure.
	 * @param dt - elapsed seconds
	 */
	private updateDoors(dt: number): void {
		for (const door of this.doors) {
			if (door.openTimer > 0) {
				door.openTimer = Math.max(0, door.openTimer - dt);
			}
			if (door.pressure < PRESSURE_SAFE) {
				door.pressure = Math.min(
					PRESSURE_SAFE,
					door.pressure + PRESSURE_RECOVERY * dt,
				);
			}
			const safeNow = door.pressure >= PRESSURE_SAFE;
			if (safeNow && !door.announcedSafe) {
				door.announcedSafe = true;
				this.events.push({ type: "safe", deck: door.deck });
			}
		}
	}

	/**
	 * Run the cargo windows down and fail on the first expired pod.
	 * @param dt - elapsed seconds
	 */
	private updateCargo(dt: number): void {
		for (const task of this.cargo) {
			if (task.status === "complete") continue;
			task.remaining = Math.max(0, task.remaining - dt);
			if (task.remaining === 0) {
				this.fail({
					kind: "timeout",
					message: `${task.code} WINDOW MISSED`,
					taskId: task.id,
					deck: task.deck,
				});
				return;
			}
		}
	}

	/**
	 * Move lifts through their committed routes and dock them at cargo decks.
	 * @param dt - elapsed seconds
	 */
	private updateElevators(dt: number): void {
		for (const elevator of this.elevators) {
			if (elevator.activeTaskId) {
				const active = this.getCargo(elevator.activeTaskId);
				if (active?.status !== "queued") {
					this.cancelActive(elevator);
				}
			}

			if (elevator.mode === "opening") {
				elevator.stateTimer = Math.max(0, elevator.stateTimer - dt);
				if (elevator.stateTimer === 0) {
					this.cancelActive(elevator);
				}
				continue;
			}

			if (elevator.mode === "moving") {
				this.moveElevator(elevator, dt);
				continue;
			}

			if (elevator.mode === "docked") continue;
			this.startNextLeg(elevator);
		}
	}

	/**
	 * Pick the next unfinished pod on a lift's route and start serving it.
	 * @param elevator - the lift to advance
	 */
	private startNextLeg(elevator: ElevatorState): void {
		const nextTask = elevator.route
			.map((taskId) => {
				return taskId ? this.getCargo(taskId) : undefined;
			})
			.find((task) => {
				return task?.status === "queued";
			});

		if (!nextTask) {
			this.cancelActive(elevator);
			return;
		}

		elevator.activeTaskId = nextTask.id;
		elevator.fromDeck = elevator.deck;
		elevator.targetDeck = nextTask.deck;
		if (Math.abs(elevator.deck - nextTask.deck) < 0.001) {
			elevator.deck = nextTask.deck;
			elevator.mode = "docked";
			elevator.stateTimer = 0;
			this.events.push({
				type: "dock",
				elevator: elevator.id,
				deck: nextTask.deck,
			});
			return;
		}
		elevator.mode = "moving";
		elevator.stateTimer = 0;
		const distance = Math.abs(elevator.deck - nextTask.deck);
		this.power -= MOVE_BASE_COST + distance * MOVE_DISTANCE_COST;
		this.events.push({
			type: "move",
			elevator: elevator.id,
			fromDeck: elevator.deck,
			toDeck: nextTask.deck,
		});
		if (this.power <= 0) {
			this.power = 0;
			this.fail({ kind: "power", message: "BASE POWER DEPLETED" });
		}
	}

	/**
	 * Interpolate one lift toward its target deck.
	 * @param elevator - the moving lift
	 * @param dt - elapsed seconds
	 */
	private moveElevator(elevator: ElevatorState, dt: number): void {
		const target = elevator.targetDeck;
		if (target === null) {
			this.cancelActive(elevator);
			return;
		}
		const delta = target - elevator.deck;
		const travel = ELEVATOR_SPEED * dt;
		if (Math.abs(delta) <= travel) {
			elevator.deck = target;
			elevator.mode = "docked";
			this.events.push({ type: "dock", elevator: elevator.id, deck: target });
		} else {
			elevator.deck += Math.sign(delta) * travel;
		}
	}

	/**
	 * Clear a lift's active leg without touching its route.
	 * @param elevator - the lift to reset
	 */
	private cancelActive(elevator: ElevatorState): void {
		elevator.activeTaskId = null;
		elevator.targetDeck = null;
		elevator.stateTimer = 0;
		elevator.mode = "idle";
	}

	/**
	 * Try to open one deck's cargo door. The player must wait for a full
	 * pressure seal; forcing a partial seal is an immediate decompression.
	 * @param deck - deck number 1..5
	 * @returns whether the door opened, and why not when it did not
	 */
	tryOpenDoor(deck: number): OpenResult {
		if (this.phase !== "running" || this.paused) {
			return { ok: false, reason: "DISPATCH IS NOT RUNNING" };
		}
		const door = this.doors[deck - 1];
		if (!door) return { ok: false, reason: "UNKNOWN DECK" };

		if (door.pressure < PRESSURE_SAFE) {
			const failure: FailureState = {
				kind: "decompression",
				message: `DECOMPRESSION — DECK ${deck}`,
				deck,
			};
			this.fail(failure);
			return { ok: false, failed: true, reason: failure.message };
		}

		const elevator = this.elevators.find((candidate) => {
			return candidate.mode === "docked" && candidate.activeTaskId !== null;
		});
		const docked = this.elevators.find((candidate) => {
			if (candidate.mode !== "docked" || !candidate.activeTaskId) return false;
			const task = this.getCargo(candidate.activeTaskId);
			return task?.deck === deck && task.status === "queued";
		});
		if (!docked?.activeTaskId) {
			return {
				ok: false,
				reason: elevator
					? `LIFT ${elevator.label} IS AT ANOTHER DECK`
					: "NO LIFT DOCKED",
			};
		}

		const task = this.getCargo(docked.activeTaskId);
		if (!task) return { ok: false, reason: "CARGO RECORD MISSING" };

		task.status = "complete";
		task.completedAt = this.elapsed;
		door.pressure = PRESSURE_AFTER_OPEN;
		door.openTimer = OPENING_TIME;
		door.announcedSafe = false;
		docked.mode = "opening";
		docked.stateTimer = OPENING_TIME;
		this.power -= DOOR_COST;
		this.events.push({ type: "open", deck, taskId: task.id });

		if (this.completedCount === this.cargo.length) {
			this.win();
		} else if (this.power <= 0) {
			this.power = 0;
			this.fail({ kind: "power", message: "BASE POWER DEPLETED" });
		}
		return { ok: true };
	}

	/**
	 * The docked lift waiting at a deck, if any.
	 * @param deck - deck number 1..5
	 * @returns the lift serving that deck
	 */
	getDockedElevator(deck: number): ElevatorState | undefined {
		return this.elevators.find((elevator) => {
			if (elevator.mode !== "docked" || !elevator.activeTaskId) return false;
			return this.getCargo(elevator.activeTaskId)?.deck === deck;
		});
	}

	/**
	 * Whether a deck's door can be opened safely right now.
	 * @param deck - deck number 1..5
	 * @returns true when the pressure seal is complete
	 */
	isDoorSafe(deck: number): boolean {
		return (this.doors[deck - 1]?.pressure ?? 0) >= PRESSURE_SAFE;
	}

	/**
	 * The most urgent uncompleted high-priority pod, for the alarm.
	 * @returns the pod closest to its deadline, or undefined
	 */
	getUrgentCargo(): CargoState | undefined {
		return this.cargo
			.filter((task) => {
				return (
					task.status !== "complete" && CARGO_STYLE[task.kind].priority >= 2
				);
			})
			.sort((a, b) => {
				return a.remaining - b.remaining;
			})[0];
	}

	/**
	 * End the run with a specific failure.
	 * @param failure - what went wrong
	 */
	private fail(failure: FailureState): void {
		if (this.phase !== "running") return;
		this.phase = "failed";
		this.paused = false;
		this.failure = failure;
		this.events.push({ type: "fail", failure });
	}

	/**
	 * End the run successfully.
	 */
	private win(): void {
		if (this.phase !== "running") return;
		this.phase = "won";
		this.paused = false;
		this.events.push({ type: "win" });
	}
}
