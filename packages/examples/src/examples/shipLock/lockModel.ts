/**
 * melonJS — Ship Lock Co-op simulation.
 *
 * Two operators share one water column. The left operator raises it through
 * the inlet; the right operator trims it with the drain and opens the upper
 * gate. The model is deterministic so a browser run and a headless check
 * produce the same lift.
 */

export const LOCK = {
	width: 1280,
	height: 800,
	startLevel: 0.08,
	targetLevel: 0.88,
	levelTolerance: 0.018,
	holdSeconds: 5,
	timeLimit: 45,
	valveRate: 0.62,
	levelRate: 0.16,
	seepage: 0.04,
	pressureLimit: 1,
	pressureSafe: 0.38,
	overfillLevel: 0.96,
	gateSeconds: 1.8,
	safeValve: 0.78,
} as const;

export type LockPhase = "running" | "gate" | "success" | "failed";
export type LockFailure = "pressure" | "pinch" | "timeout" | null;

export interface LockControls {
	inletOpen: boolean;
	inletClose: boolean;
	drainOpen: boolean;
	drainClose: boolean;
	gate: boolean;
}

export interface LockState {
	phase: LockPhase;
	failure: LockFailure;
	level: number;
	levelRate: number;
	inlet: number;
	drain: number;
	pressure: number;
	stableTime: number;
	timeLeft: number;
	elapsed: number;
	gateProgress: number;
	throughFlow: number;
	leftInput: boolean;
	rightInput: boolean;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const createLockState = (): LockState => ({
	phase: "running",
	failure: null,
	level: LOCK.startLevel,
	levelRate: 0,
	inlet: 0,
	drain: 0,
	pressure: 0.18,
	stableTime: 0,
	timeLeft: LOCK.timeLimit,
	elapsed: 0,
	gateProgress: 0,
	throughFlow: 0,
	leftInput: false,
	rightInput: false,
});

const moveValve = (
	current: number,
	open: boolean,
	close: boolean,
	dt: number,
) => {
	const direction = (open ? 1 : 0) - (close ? 1 : 0);
	return clamp(current + direction * LOCK.valveRate * dt, 0, 1);
};

/**
 * Advance the lock by `dt` seconds. Callers should pass small, fixed steps
 * (the example uses 1/120 s) so the pressure and hold timers are stable.
 */
export const stepLock = (
	state: LockState,
	controls: LockControls,
	dt: number,
): LockState => {
	if (state.phase === "success" || state.phase === "failed") {
		return state;
	}

	state.elapsed += dt;
	state.leftInput = controls.inletOpen || controls.inletClose;
	state.rightInput = controls.drainOpen || controls.drainClose || controls.gate;

	if (state.phase === "gate") {
		state.gateProgress = clamp(
			state.gateProgress + dt / LOCK.gateSeconds,
			0,
			1,
		);
		if (state.gateProgress >= 1) {
			state.phase = "success";
		}
		return state;
	}

	state.timeLeft = Math.max(0, state.timeLeft - dt);
	state.inlet = moveValve(
		state.inlet,
		controls.inletOpen,
		controls.inletClose,
		dt,
	);
	state.drain = moveValve(
		state.drain,
		controls.drainOpen,
		controls.drainClose,
		dt,
	);

	state.throughFlow = Math.min(state.inlet, state.drain);
	state.levelRate =
		(state.inlet - state.drain * 0.85) *
			(1 + 0.55 * state.throughFlow) *
			LOCK.levelRate -
		LOCK.seepage;
	state.level = clamp(state.level + state.levelRate * dt, 0, 1);

	const overInlet = Math.max(0, state.inlet - LOCK.safeValve);
	const overDrain = Math.max(0, state.drain - 0.75);
	const drainRelief =
		state.drain <= 0.6 ? state.drain * 1.8 : 1.08 - (state.drain - 0.6) * 1.1;
	const pressureTarget = Math.max(
		0.02,
		0.188 +
			state.inlet * 0.9 +
			state.drain * 0.35 +
			overInlet * 1.8 +
			overDrain * 4.7 -
			drainRelief +
			state.throughFlow * 0.32,
	);
	const pressureTau = pressureTarget > state.pressure ? 0.3 : 0.18;
	state.pressure +=
		(pressureTarget - state.pressure) * (1 - Math.exp(-dt / pressureTau));

	const steady =
		Math.abs(state.level - LOCK.targetLevel) <= LOCK.levelTolerance &&
		state.pressure <= LOCK.pressureSafe;
	state.stableTime = steady
		? Math.min(LOCK.holdSeconds, state.stableTime + dt)
		: 0;

	if (
		state.stableTime >= LOCK.holdSeconds &&
		controls.gate &&
		state.phase === "running"
	) {
		state.phase = "gate";
		state.gateProgress = 0;
		state.leftInput = true;
		state.rightInput = true;
		return state;
	}

	if (state.pressure >= LOCK.pressureLimit) {
		state.phase = "failed";
		state.failure = "pressure";
	} else if (state.level >= LOCK.overfillLevel) {
		state.phase = "failed";
		state.failure = "pinch";
	} else if (state.timeLeft <= 0) {
		state.phase = "failed";
		state.failure = "timeout";
	}

	return state;
};
