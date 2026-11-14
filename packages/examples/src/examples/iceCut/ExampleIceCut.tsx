/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, state, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { VIEW_H, VIEW_W } from "./constants";
import { IceCutStage } from "./play";

const createGame = async () => {
	const app = new Application(VIEW_W, VIEW_H, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#02060b",
		antiAlias: true,
		renderer: video.CANVAS,
	});
	await app.init();
	state.set(state.PLAY, new IceCutStage());
	state.change(state.PLAY);
};

export const ExampleIceCut = createExampleComponent(createGame);
