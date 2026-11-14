/**
 * Headless balance check for the Ship Lock Co-op example.
 *
 * Runs five deterministic 120 Hz sessions:
 * - both operators feathering their valves complete a full lift;
 * - the inlet operator alone never reaches the five-second hold;
 * - the drain operator alone can only lower the chamber and times out;
 * - slamming either valve alone bursts the pressure limit.
 *
 * Run with `pnpm -F examples verify:ship-lock`.
 */
import {
	createLockState,
	LOCK,
	type LockControls,
	type LockState,
	stepLock,
} from "../src/examples/shipLock/lockModel.ts";

const DT = 1 / 120;

const blankControls = (): LockControls => ({
	inletOpen: false,
	inletClose: false,
	drainOpen: false,
	drainClose: false,
	gate: false,
});

const steer = (
	state: LockState,
	controls: LockControls,
	key: "inlet" | "drain",
	target: number,
	openKey: "inletOpen" | "drainOpen",
	closeKey: "inletClose" | "drainClose",
) => {
	const value = state[key];
	const deadband = 0.02;
	controls[openKey] = value < target - deadband;
	controls[closeKey] = value > target + deadband;
};

const run = (
	name: string,
	drive: (state: LockState, controls: LockControls) => void,
	seconds = LOCK.timeLimit + 2,
) => {
	const state = createLockState();
	const controls = blankControls();
	for (let time = 0; time < seconds; time += DT) {
		drive(state, controls);
		stepLock(state, controls, DT);
		if (state.phase === "success" || state.phase === "failed") {
			break;
		}
	}
	return {
		name,
		phase: state.phase,
		failure: state.failure,
		level: Number(state.level.toFixed(3)),
		pressure: Number(state.pressure.toFixed(3)),
		stableTime: Number(state.stableTime.toFixed(2)),
		elapsed: Number(state.elapsed.toFixed(1)),
		inlet: Number(state.inlet.toFixed(2)),
		drain: Number(state.drain.toFixed(2)),
	};
};

const coOp = run("two operators", (state, controls) => {
	const drainTarget = state.pressure > 0.34 ? 0.5 : 0.13;
	const inletTarget = Math.max(
		0,
		Math.min(
			0.78,
			0.3 + (LOCK.targetLevel - state.level) * 4 + state.drain * 0.4,
		),
	);
	steer(state, controls, "inlet", inletTarget, "inletOpen", "inletClose");
	steer(state, controls, "drain", drainTarget, "drainOpen", "drainClose");
	controls.gate = state.stableTime >= LOCK.holdSeconds;
});

const inletOnly = run("inlet operator alone", (state, controls) => {
	const inletTarget = Math.max(
		0,
		Math.min(0.78, 0.3 + (LOCK.targetLevel - state.level) * 4),
	);
	steer(state, controls, "inlet", inletTarget, "inletOpen", "inletClose");
	controls.gate = state.stableTime >= LOCK.holdSeconds;
});

const drainOnly = run("drain operator alone", (state, controls) => {
	steer(state, controls, "drain", 0.3, "drainOpen", "drainClose");
	controls.gate = state.stableTime >= LOCK.holdSeconds;
});

const inletSlammed = run("inlet slammed", (_state, controls) => {
	controls.inletOpen = true;
});

const drainSlammed = run("drain slammed", (_state, controls) => {
	controls.drainOpen = true;
});

const results = [coOp, inletOnly, drainOnly, inletSlammed, drainSlammed];
console.log(JSON.stringify(results, null, 2));

if (
	coOp.phase !== "success" ||
	inletOnly.phase !== "failed" ||
	drainOnly.phase !== "failed" ||
	inletSlammed.failure !== "pressure" ||
	drainSlammed.failure !== "pressure"
) {
	throw new Error("Ship Lock balance check failed");
}
