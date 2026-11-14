/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { Application, state, video, WebGLRenderer } from "melonjs";
import { createExampleComponent } from "../utils";
import "./tidalCrystals.css";
import { TidalStage } from "./stage";

const createGame = async () => {
	const app = new Application(1280, 720, {
		parent: "screen",
		scale: "auto",
		renderer: video.WEBGL,
		antiAlias: true,
		subPixel: true,
		backgroundColor: "#061018",
	});
	await app.init();

	if (!(app.renderer instanceof WebGLRenderer)) {
		throw new Error("The Tidal Crystals example requires WebGL 2");
	}

	app.world.backgroundColor.parseCSS("#061018");
	state.set(state.PLAY, new TidalStage());
	state.change(state.PLAY, true);
};

export const ExampleTidalCrystals = createExampleComponent(createGame);
