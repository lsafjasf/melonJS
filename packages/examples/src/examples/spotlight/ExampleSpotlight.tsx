/**
 * melonJS — The Last Spotlight example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, audio, state, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { VIEW_H, VIEW_W } from "./constants";
import { SpotlightStage } from "./stage";

const createGame = async () => {
	// The example draws its stage directly with the Canvas renderer's
	// immediate-mode API, so pin it instead of letting the backend vary.
	const scaleTarget = document.getElementById("screen") ?? undefined;
	const app = new Application(VIEW_W, VIEW_H, {
		parent: "screen",
		scaleMethod: "fit",
		scaleTarget,
		renderer: video.CANVAS,
		backgroundColor: "#08070c",
		antiAlias: true,
	});
	await app.init();
	app.renderer.getCanvas().style.cursor = "crosshair";

	// No audio files: the show is built from `audio.tone` and `audio.noise`.
	// `init` still has to run before any generated sound asks for a context.
	audio.init("mp3");
	state.set(state.PLAY, new SpotlightStage());
	state.change(state.PLAY, true);
};

export const ExampleSpotlight = createExampleComponent(createGame);
