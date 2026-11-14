/**
 * melonJS — paper puppet show example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, loader, state, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { PaperPuppetStage } from "./game";

const fontBase = `${import.meta.env.BASE_URL}assets/paperPuppet/fonts/`;

const createGame = async () => {
	const app = new Application(1280, 760, {
		parent: "screen",
		scale: "auto",
		renderer: video.AUTO,
		antiAlias: true,
		backgroundColor: "#1b1311",
	});
	await app.init();

	await loader.preload([
		{
			name: "Noto Sans SC",
			type: "fontface",
			src: `${fontBase}noto-sans-sc-subset.ttf`,
		},
	]);

	state.set(state.PLAY, new PaperPuppetStage());
	state.change(state.PLAY);
};

export const ExamplePaperPuppet = createExampleComponent(createGame);
