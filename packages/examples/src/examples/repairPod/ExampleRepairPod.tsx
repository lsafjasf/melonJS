/**
 * melonJS — Repair Pod docking example: Application bootstrap.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * A fixed, zero-gravity three-berth docking qualification. The Planck adapter
 * is used because the berth arms must collide at their current rotation.
 * Controls: W/S fore-aft, A/D port-starboard, Q/E attitude, R restart.
 */
import { PlanckAdapter } from "@melonjs/planck-adapter";
import { Application, state, video } from "melonjs";
import { createExampleComponent } from "../utils";
import { VIEWPORT_H, VIEWPORT_W } from "./constants";
import { bindRepairPodControls, RepairPodStage } from "./stage";

const createGame = async () => {
	const screen = document.getElementById("screen");
	const app = new Application(VIEWPORT_W, VIEWPORT_H, {
		parent: "screen",
		scaleMethod: "fit",
		...(screen === null ? {} : { scaleTarget: screen }),
		renderer: video.AUTO,
		antiAlias: true,
		physic: await PlanckAdapter.create({
			gravity: { x: 0, y: 0 },
			pixelsPerMeter: 32,
			subSteps: 2,
		}),
	});
	await app.init();

	bindRepairPodControls();
	state.set(state.PLAY, new RepairPodStage());
	state.change(state.PLAY, true);
};

export const ExampleRepairPod = createExampleComponent(createGame);
