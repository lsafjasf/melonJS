/**
 * melonJS — two-player gantry crane example: application and stage wiring.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import {
	Application,
	ColorLayer,
	input,
	Stage,
	state,
	Trail,
	video,
} from "melonjs";
import { COLORS, VIEWPORT_H, VIEWPORT_W } from "./constants";
import { GantryCrane } from "./GantryCrane";
import { GantryHUD } from "./hud";
import { CraneSimulation } from "./simulation";

const KEY_BINDINGS: readonly [number, string, boolean?][] = [
	[input.KEY.A, "beamLeft"],
	[input.KEY.D, "beamRight"],
	[input.KEY.UP, "trolleyForward"],
	[input.KEY.DOWN, "trolleyBack"],
	[input.KEY.LEFT, "hoistDown"],
	[input.KEY.RIGHT, "hoistUp"],
	[input.KEY.R, "restart", true],
];

const CRATE_TRAIL_WIDTH = 46;

function buildTrails(sim: CraneSimulation): Trail[] {
	return sim.crates.map((crate) => {
		return new Trail({
			length: 34,
			lifetime: 880,
			minDistance: 9,
			width: CRATE_TRAIL_WIDTH,
			widthCurve: [1, 0.9, 0.6, 0.28, 0],
			gradient: [`${crate.color}aa`, `${crate.color}44`, `${crate.color}00`],
			opacity: 0.28,
			blendMode: "normal",
		});
	});
}

class GantryStage extends Stage {
	override onResetEvent(app: Application): void {
		for (const [key, action, lock] of KEY_BINDINGS) {
			input.bindKey(key, action, lock);
		}

		const sim = new CraneSimulation();
		const trails = buildTrails(sim);

		app.world.addChild(new ColorLayer("yard", COLORS.background), 0);
		for (const trail of trails) {
			app.world.addChild(trail, 4);
		}

		app.world.addChild(new GantryCrane(app, sim, trails), 10);
		app.world.addChild(new GantryHUD(sim), 20);
	}

	override onDestroyEvent(): void {
		for (const [key] of KEY_BINDINGS) {
			input.unbindKey(key);
		}
	}
}

export const createGame = async (): Promise<void> => {
	const scaleTarget = document.getElementById("screen") ?? undefined;
	const app = new Application(VIEWPORT_W, VIEWPORT_H, {
		parent: "screen",
		scale: "auto",
		scaleTarget,
		renderer: video.AUTO,
		backgroundColor: COLORS.background,
		antiAlias: true,
	});
	await app.init();

	state.set(state.PLAY, new GantryStage());
	state.change(state.PLAY);
};
