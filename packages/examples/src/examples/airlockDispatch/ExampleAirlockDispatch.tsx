/**
 * melonJS — Airlock Dispatch example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { Application, audio, input, state } from "melonjs";
import { createExampleComponent } from "../utils";
import { DispatchStage } from "./stage";

const DISPATCH_STATE = state.USER + 1;

const createGame = async () => {
	const app = new Application(1280, 800, {
		parent: "screen",
		scale: "auto",
		backgroundColor: "#050a10",
	});
	await app.init();

	audio.init("mp3,ogg");
	input.bindKey(input.KEY.SPACE, "dispatchPause", true);
	input.bindKey(input.KEY.P, "dispatchPause", true);
	input.bindKey(input.KEY.ENTER, "dispatchLaunch", true);
	input.bindKey(input.KEY.R, "dispatchRestart", true);

	state.set(DISPATCH_STATE, new DispatchStage());
	state.change(DISPATCH_STATE, true);
};

export const ExampleAirlockDispatch = createExampleComponent(createGame);
