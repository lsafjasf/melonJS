/**
 * melonJS — Thermal Control example (bootstrap).
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A ship just crossed from shadow into sunlight: manage coolant valves,
 * the radiator and device switches to keep the crew cabin inside its safe
 * temperature band for 120 s without draining the propulsion reserve.
 */
import { Application, state } from "melonjs";
import { createExampleComponent } from "../utils";
import { EndScreen, PlayScreen, testHook } from "./stage";
import { VIEW_H, VIEW_W } from "./view";

const createGame = async () => {
	const app = new Application(VIEW_W, VIEW_H, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#0a0d14",
	});
	await app.init();

	// test hook: the live simulation, for the browser console and e2e checks
	(globalThis as Record<string, unknown>).__thermal = testHook;

	state.set(state.PLAY, new PlayScreen());
	state.set(state.GAMEOVER, new EndScreen());
	state.set(state.GAME_END, new EndScreen());
	state.change(state.PLAY);
};

export const ExampleThermalControl = createExampleComponent(createGame);
