/**
 * melonJS — Rhythm Kitchen mini-game example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, state } from "melonjs";
import { createExampleComponent } from "../utils";
import { KitchenStage } from "./KitchenStage";

const createGame = async () => {
	const app = new Application(1200, 720, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#0b1019",
	});
	await app.init();

	const stage = new KitchenStage();
	state.set(state.PLAY, stage);
	state.change(state.PLAY, true);
};

export const ExampleRhythmKitchen = createExampleComponent(createGame);
