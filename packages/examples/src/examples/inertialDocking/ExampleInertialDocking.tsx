/**
 * melonJS — Inertial Docking.
 *
 * A top-down approach trainer: three seeded rotating berths, Newtonian drift,
 * a finite pressure hull and a fuel tank that can strand you. The simulation
 * is deterministic; the renderer is entirely procedural Canvas geometry.
 *
 * Controls: W/S fore-aft, A/D lateral, Q/E rotate, Shift boost, R reset.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, audio, input, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { RECOVERY, SHIP_RADIUS, VIEWPORT_H, VIEWPORT_W } from "./constants";
import { MissionHud, MissionView } from "./MissionView";
import { currentBerth, type GameState, speedOf } from "./simulation";

interface DockingSnapshot {
	phase: GameState["phase"];
	hull: number;
	fuel: number;
	speed: number;
	nextBerth: number;
	x: number;
	y: number;
	secured: boolean[];
}

interface DockingTestApi {
	snapshot: () => DockingSnapshot;
	reset: () => void;
	dockNextLowSpeed: () => boolean;
	ramBerth: (index?: number, speed?: number) => boolean;
	enterRecoveryLowSpeed: () => boolean;
}

type DebugGlobal = typeof globalThis & {
	__inertialDocking?: DockingTestApi;
};

const createGame = async () => {
	const app = new Application(VIEWPORT_W, VIEWPORT_H, {
		parent: "screen",
		renderer: video.AUTO,
		scale: "auto",
		backgroundColor: "#040711",
	});
	await app.init();
	audio.init("mp3,ogg");

	app.world.backgroundColor.parseCSS("#040711");
	const view = new MissionView();
	const hud = new MissionHud(view);
	app.world.addChild(view, 10);
	app.world.addChild(hud, 100);

	const bindings: [number, string, boolean?][] = [
		[input.KEY.W, "forward"],
		[input.KEY.UP, "forward-alt"],
		[input.KEY.S, "reverse"],
		[input.KEY.DOWN, "reverse-alt"],
		[input.KEY.A, "strafe-left"],
		[input.KEY.LEFT, "strafe-left"],
		[input.KEY.D, "strafe-right"],
		[input.KEY.RIGHT, "strafe-right"],
		[input.KEY.Q, "rotate-left"],
		[input.KEY.E, "rotate-right"],
		[input.KEY.SHIFT, "boost"],
		[input.KEY.R, "restart", true],
	];
	for (const [key, action, locked] of bindings) {
		input.bindKey(key, action, locked);
	}

	/**
	 * Browser-level probes for the example's two acceptance paths:
	 * gently place the craft in a legal docking window, or put it on a
	 * high-energy wall approach. Gameplay still goes through `stepGame()`.
	 */
	const debugGlobal = globalThis as DebugGlobal;
	debugGlobal.__inertialDocking = {
		snapshot: () => {
			const gameState = view.state;
			return {
				phase: gameState.phase,
				hull: gameState.ship.hull,
				fuel: gameState.ship.fuel,
				speed: speedOf(gameState.ship),
				nextBerth: gameState.nextBerth,
				x: gameState.ship.x,
				y: gameState.ship.y,
				secured: gameState.berths.map((berth) => {
					return berth.secured;
				}),
			};
		},
		reset: () => {
			view.reset();
		},
		dockNextLowSpeed: () => {
			const target = currentBerth(view.state);
			if (target === undefined) {
				return false;
			}
			const heading = target.angle + Math.PI;
			view.state.ship.x = target.x;
			view.state.ship.y = target.y;
			view.state.ship.vx = Math.cos(heading) * 18;
			view.state.ship.vy = Math.sin(heading) * 18;
			view.state.ship.angle = heading;
			view.state.ship.angularVelocity = 0;
			return true;
		},
		ramBerth: (index = view.state.nextBerth, speed = 265) => {
			const berth = view.state.berths[index];
			if (berth === undefined) {
				return false;
			}
			const wallAngle = berth.angle + Math.PI * 0.5;
			const distance = berth.radius + SHIP_RADIUS + 28;
			const heading = wallAngle + Math.PI;
			view.state.ship.x = berth.x + Math.cos(wallAngle) * distance;
			view.state.ship.y = berth.y + Math.sin(wallAngle) * distance;
			view.state.ship.vx = Math.cos(heading) * speed;
			view.state.ship.vy = Math.sin(heading) * speed;
			view.state.ship.angle = heading;
			view.state.ship.angularVelocity = 0;
			view.state.ship.hull = 100;
			return true;
		},
		enterRecoveryLowSpeed: () => {
			if (view.state.nextBerth < view.state.berths.length) {
				return false;
			}
			view.state.ship.x = RECOVERY.x;
			view.state.ship.y = RECOVERY.y;
			view.state.ship.vx = 20;
			view.state.ship.vy = 0;
			view.state.ship.angle = 0;
			view.state.ship.angularVelocity = 0;
			return true;
		},
	};

	return () => {
		for (const [key] of bindings) {
			input.unbindKey(key);
		}
		delete debugGlobal.__inertialDocking;
		app.viewport.reset();
	};
};

export const ExampleInertialDocking = createExampleComponent(createGame);
