/**
 * melonJS — Lighthouse Relay example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * An asymmetric two-keyboard relay. P1 sees the ship and its berth
 * clearance, aims the twin lamp, and holds the beam for a short or long
 * pulse. P2 sees only the three-pulse return echo and the shared lens
 * heat, then answers with the relay lamp. Three matched handshakes and a
 * safe berth win the drill.
 *
 * P1: A / D aim, hold S to transmit.
 * P2: ← / → select the echo code, Enter sends the confirmation.
 */
import { Application } from "melonjs";
import { createExampleComponent } from "../utils";
import { VIEW_H, VIEW_W } from "./constants";
import { startRelayStage } from "./screen";

export const ExampleLighthouseRelay = createExampleComponent(async () => {
	const app = new Application(VIEW_W, VIEW_H, {
		parent: "screen",
		scale: "auto",
		scaleMethod: "fit",
		backgroundColor: "#03131d",
	});
	await app.init();
	startRelayStage();
});
