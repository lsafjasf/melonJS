/**
 * melonJS — pseudo-colour terrain processor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { createExampleComponent } from "../utils";
import { createTerrainLab } from "./lab";

export const ExamplePseudoColorTerrain = createExampleComponent(async () => {
	// Let StrictMode's development-only mount probe settle before building the
	// DOM editor. The example has no engine canvas to re-parent, so the editor
	// must be created once, after the probe's cleanup.
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
	const screen = document.getElementById("screen");
	if (!screen) {
		return;
	}
	return createTerrainLab(screen);
});
