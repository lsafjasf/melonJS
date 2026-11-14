/**
 * melonJS — Inertial Docking: deterministic acceptance checks.
 *
 * Run from `packages/examples` with:
 *   pnpm exec tsx src/examples/inertialDocking/simulation.test.ts
 *
 * The two paths the example has to prove are both here: a legal low-speed
 * docking sequence and a high-energy contact that destroys the pressure hull.
 * Keeping them at the simulation layer makes the result independent of frame
 * rate, renderer and audio availability.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import assert from "node:assert/strict";
import {
	DOCK_SPEED,
	HULL_MAX,
	INITIAL_FUEL,
	MAIN_BURN,
	RCS_BURN,
	RECOVERY,
	ROTATION_BURN,
	SHIP_RADIUS,
	START,
} from "./constants";
import {
	createGameState,
	currentBerth,
	IDLE_INPUT,
	speedOf,
	stepGame,
} from "./simulation";

const DT = 1 / 120;
let checks = 0;

const check = (condition: boolean, message: string) => {
	checks++;
	assert.ok(condition, message);
};

const dockAtIndex = (index: number) => {
	const state = createGameState();
	for (let current = 0; current <= index; current++) {
		const target = currentBerth(state);
		assert.ok(target, "the next berth must exist");
		const heading = target.angle + Math.PI;
		state.ship.x = target.x;
		state.ship.y = target.y;
		state.ship.vx = Math.cos(heading) * 18;
		state.ship.vy = Math.sin(heading) * 18;
		state.ship.angle = heading;
		state.ship.angularVelocity = 0;
		stepGame(state, IDLE_INPUT, DT);
		check(
			target.secured,
			`berth ${target.id} accepts a low-speed aligned contact`,
		);
	}
	return state;
};

console.log("fixed seed");
const seededA = createGameState();
const seededB = createGameState();
check(
	seededA.berths.every((berth, index) => {
		const other = seededB.berths[index];
		return berth.angle === other.angle && berth.spin === other.spin;
	}),
	"the same seed produces the same berth phases and spin rates",
);
check(
	new Set(seededA.berths.map((berth) => berth.spin)).size === 3,
	"all three berths spin at different rates",
);
check(
	seededA.berths.some((berth) => berth.spin < 0) &&
		seededA.berths.some((berth) => berth.spin > 0),
	"the seeded layout includes both spin directions",
);

console.log("low-speed docking");
const successState = dockAtIndex(2);
check(successState.nextBerth === 3, "all three berths are secured in order");
check(successState.ship.hull === HULL_MAX, "legal contact does no hull damage");
check(successState.phase === "running", "the mission continues to recovery");
successState.ship.x = RECOVERY.x;
successState.ship.y = RECOVERY.y;
successState.ship.vx = 20;
successState.ship.vy = 0;
successState.ship.angle = 0;
successState.ship.angularVelocity = 0;
stepGame(successState, IDLE_INPUT, DT);
check(
	successState.phase === "success",
	"entering recovery at low speed and the right heading completes the run",
);

console.log("over-speed collision");
const failureState = createGameState();
const berth = failureState.berths[0];
const wallAngle = berth.angle + Math.PI * 0.5;
const distance = berth.radius + SHIP_RADIUS + 28;
const heading = wallAngle + Math.PI;
failureState.ship.x = berth.x + Math.cos(wallAngle) * distance;
failureState.ship.y = berth.y + Math.sin(wallAngle) * distance;
failureState.ship.vx = Math.cos(heading) * 280;
failureState.ship.vy = Math.sin(heading) * 280;
failureState.ship.angle = heading;
failureState.ship.angularVelocity = 0;

let failed = false;
for (let frame = 0; frame < 240 && !failed; frame++) {
	stepGame(failureState, IDLE_INPUT, DT);
	failed = failureState.phase === "failed";
}
check(failed, "a 280 px/s wall contact fails the mission");
check(failureState.ship.hull === 0, "the over-speed impact destroys the hull");
check(
	failureState.lastImpact >= DOCK_SPEED,
	"the failure records an impact well above the docking limit",
);

console.log("coasting");
const coastState = createGameState();
coastState.ship.x = START.x;
coastState.ship.y = START.y;
coastState.ship.vx = 80;
coastState.ship.vy = 0;
coastState.ship.fuel = 0;
const beforeX = coastState.ship.x;
for (let frame = 0; frame < 120; frame++) {
	stepGame(coastState, IDLE_INPUT, DT);
}
check(
	Math.abs(speedOf(coastState.ship) - 80) < 0.001,
	"an empty tank does not slow the craft",
);
check(
	coastState.ship.x > beforeX + 70,
	"an empty tank still permits inertial drift",
);

const referenceFuelBudget =
	4 * 5.5 * MAIN_BURN + 3 * 6 * RCS_BURN + 3 * 5 * ROTATION_BURN;
check(
	INITIAL_FUEL >= referenceFuelBudget,
	`the initial tank (${INITIAL_FUEL}) covers the reference route budget (${referenceFuelBudget})`,
);

console.log(`\n${checks} checks passed.`);
