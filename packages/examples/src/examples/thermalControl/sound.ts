/**
 * melonJS — Thermal Control example: procedural audio.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * All sound is synthesized with audio.tone / audio.noise: a pump hum that
 * follows the coolant pump speed, and an alarm whose tempo and pitch
 * follow the alarm level. Both are silent no-ops until the browser
 * unlocks the audio context on the first user gesture.
 */
import { audio } from "melonjs";
import type { ThermalSim } from "./simulation";

export class SoundController {
	private pumpTimer = 0;
	private alarmTimer = 0;
	private seenOverheats = 0;
	private ended = false;

	/** call every frame with the real (unscaled) frame delta in ms */
	update(dtMs: number, sim: ThermalSim) {
		const dt = dtMs / 1000;

		if (sim.status !== "running") {
			if (!this.ended) {
				this.ended = true;
				if (sim.status === "won") {
					audio.tone({ freq: 523, duration: 0.15, gain: 0.12 });
					audio.tone({ freq: 659, duration: 0.15, delay: 0.15, gain: 0.12 });
					audio.tone({ freq: 784, duration: 0.4, delay: 0.3, gain: 0.12 });
				} else {
					audio.tone({
						freq: 220,
						duration: 0.3,
						wave: "sawtooth",
						gain: 0.14,
					});
					audio.tone({
						freq: 110,
						duration: 0.7,
						delay: 0.25,
						wave: "sawtooth",
						gain: 0.14,
					});
				}
			}
			return;
		}

		// pump hum: pitch and loudness follow the pump speed
		this.pumpTimer -= dt;
		if (this.pumpTimer <= 0) {
			this.pumpTimer = 0.3;
			if (sim.pumpSpeed > 0.02 && sim.coolant > 0) {
				audio.tone({
					freq: 50 + sim.pumpSpeed * 90,
					duration: 0.32,
					wave: "sawtooth",
					gain: 0.03 + sim.pumpSpeed * 0.07,
				});
				audio.noise({
					duration: 0.3,
					type: "pink",
					gain: 0.015 + sim.pumpSpeed * 0.03,
					filter: { type: "lowpass", frequency: 300 + sim.pumpSpeed * 700 },
				});
			}
		}

		// a compartment just overheated: harsh buzz on top of the alarm
		if (sim.overheatLog.length > this.seenOverheats) {
			this.seenOverheats = sim.overheatLog.length;
			audio.tone({ freq: 180, duration: 0.5, wave: "square", gain: 0.12 });
			audio.tone({
				freq: 90,
				duration: 0.5,
				delay: 0.05,
				wave: "square",
				gain: 0.1,
			});
		}

		// alarm beeps: faster and higher as the level rises
		if (sim.alarmLevel > 0) {
			this.alarmTimer -= dt;
			if (this.alarmTimer <= 0) {
				const level = sim.alarmLevel;
				this.alarmTimer = [0, 1.5, 0.9, 0.45][level];
				audio.tone({
					freq: 700 + level * 150,
					duration: 0.12,
					wave: "square",
					gain: 0.06,
				});
				if (level >= 2) {
					audio.tone({
						freq: 950 + level * 150,
						duration: 0.12,
						delay: 0.16,
						wave: "square",
						gain: 0.06,
					});
				}
			}
		}
	}
}
