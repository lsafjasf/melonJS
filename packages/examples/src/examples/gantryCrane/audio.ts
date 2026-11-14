/**
 * melonJS — two-player gantry crane example: procedural mechanical audio.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * There are no clips to preload. Each motion axis owns a different mechanical
 * voice and its own beat clock, so moving both at once interleaves a low
 * bridge thump with a higher trolley tick instead of playing one averaged
 * engine note.
 */
import { audio } from "melonjs";
import type { CraneSimulation, SimEvent } from "./simulation";

function clamp01(value: number): number {
	return value < 0 ? 0 : value > 1 ? 1 : value;
}

export class CraneAudio {
	private beamBeat = 0;
	private trolleyBeat = 0;
	private hoistBeat = 0;

	update(dtMs: number, sim: CraneSimulation): void {
		if (sim.phase !== "playing") {
			return;
		}

		const dt = dtMs / 1000;
		const loadTone = 1 / Math.sqrt(sim.loadMass);
		const beamNorm = clamp01(Math.abs(sim.beamSpeed) / 286);
		const trolleyNorm = clamp01(Math.abs(sim.trolleySpeed) / 248);
		const hoistNorm = clamp01(Math.abs(sim.hoistSpeed) / 0.72);

		if (Math.abs(beamNorm) > 0.04) {
			this.beamBeat -= dt;
			if (this.beamBeat <= 0) {
				this.beamBeat =
					(0.36 - 0.17 * Math.abs(beamNorm)) / (0.82 + loadTone * 0.18);
				this.beamTick(Math.abs(beamNorm), loadTone);
			}
		} else {
			this.beamBeat = 0;
		}

		if (Math.abs(trolleyNorm) > 0.04) {
			this.trolleyBeat -= dt;
			if (this.trolleyBeat <= 0) {
				this.trolleyBeat = 0.285 - 0.115 * Math.abs(trolleyNorm);
				this.trolleyTick(Math.abs(trolleyNorm));
			}
		} else {
			this.trolleyBeat = 0;
		}

		if (Math.abs(hoistNorm) > 0.07) {
			this.hoistBeat -= dt;
			if (this.hoistBeat <= 0) {
				this.hoistBeat = 0.105 + 0.05 * (1 - Math.abs(hoistNorm));
				this.hoistRatchet(Math.abs(hoistNorm));
			}
		} else {
			this.hoistBeat = 0;
		}
	}

	playEvents(events: readonly SimEvent[]): void {
		for (const event of events) {
			switch (event.type) {
				case "latch":
					this.latch();
					break;
				case "place":
					this.place();
					break;
				case "collision":
					this.collision();
					break;
				case "win":
					this.win();
					break;
				case "fail":
					this.fail();
					break;
				case "restart":
					this.beamBeat = 0;
					this.trolleyBeat = 0;
					this.hoistBeat = 0;
					break;
			}
		}
	}

	private beamTick(norm: number, loadTone: number): void {
		audio.noise({
			type: "brown",
			duration: 0.075,
			gain: 0.026 + norm * 0.026,
			attack: 0.001,
			pan: -0.38,
			filter: { type: "lowpass", frequency: 170 + norm * 110, Q: 0.7 },
		});
		audio.tone({
			freq: (72 + norm * 28) * loadTone,
			duration: 0.09,
			wave: "square",
			gain: 0.012 + norm * 0.012,
			attack: 0.001,
			pitchSlide: 0.72,
			pan: -0.38,
		});
	}

	private trolleyTick(norm: number): void {
		audio.noise({
			type: "white",
			duration: 0.035,
			gain: 0.016 + norm * 0.016,
			attack: 0.001,
			pan: 0.38,
			filter: { type: "highpass", frequency: 1350 + norm * 700, Q: 0.9 },
		});
		audio.tone({
			freq: 380 + norm * 250,
			duration: 0.055,
			wave: "square",
			gain: 0.009 + norm * 0.011,
			attack: 0.001,
			pitchSlide: 0.9,
			pan: 0.38,
		});
	}

	private hoistRatchet(norm: number): void {
		audio.noise({
			type: "white",
			duration: 0.026,
			gain: 0.012 + norm * 0.01,
			attack: 0.001,
			filter: { type: "bandpass", frequency: 2100, Q: 2.2 },
		});
	}

	private latch(): void {
		audio.noise({
			type: "white",
			duration: 0.045,
			gain: 0.16,
			attack: 0.001,
			filter: { type: "lowpass", frequency: 1100, Q: 0.8 },
		});
		audio.tone({
			freq: [120, 180],
			duration: 0.14,
			wave: "square",
			gain: 0.065,
			pitchSlide: 0.55,
		});
	}

	private place(): void {
		audio.noise({
			type: "brown",
			duration: 0.16,
			gain: 0.14,
			attack: 0.001,
			filter: { type: "lowpass", frequency: 420, Q: 0.7 },
		});
		audio.tone({
			freq: [262, 392],
			duration: 0.18,
			wave: "sine",
			gain: 0.075,
		});
		audio.tone({
			freq: 523,
			duration: 0.25,
			wave: "sine",
			gain: 0.06,
			delay: 0.12,
		});
	}

	private collision(): void {
		audio.noise({
			type: "white",
			duration: 0.1,
			gain: 0.2,
			attack: 0.001,
			filter: { type: "bandpass", frequency: 900, Q: 1.2 },
			filterSweep: 0.45,
		});
		audio.tone({
			freq: 92,
			duration: 0.24,
			wave: "sawtooth",
			gain: 0.08,
			pitchSlide: 0.45,
		});
	}

	private win(): void {
		const notes = [262, 330, 392, 523];
		notes.forEach((freq, index) => {
			audio.tone({
				freq,
				duration: 0.42,
				wave: "triangle",
				gain: 0.08,
				delay: index * 0.12,
			});
		});
	}

	private fail(): void {
		audio.tone({
			freq: 164,
			duration: 0.8,
			wave: "sawtooth",
			gain: 0.09,
			pitchSlide: 0.35,
		});
		audio.noise({
			type: "brown",
			duration: 0.65,
			gain: 0.13,
			attack: 0.01,
			filter: { type: "lowpass", frequency: 360, Q: 0.6 },
		});
	}
}
