/**
 * melonJS — Inertial Docking: procedural sound cues.
 *
 * The controls are the instrument here: thrust level changes the exhaust
 * filter and gain, lateral RCS jets pan to their side, and every contact maps
 * its momentum to the weight of the impact.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { audio } from "melonjs";

export type ThrusterSound = "main" | "reverse" | "lateral" | "rotation";

const clamp = (value: number, low = 0, high = 1) =>
	Math.max(low, Math.min(high, value));

export function playThruster(
	kind: ThrusterSound,
	level: number,
	pan = 0,
): void {
	const strength = clamp(level, 0.15, 1);
	if (kind === "main" || kind === "reverse") {
		audio.noise({
			type: "brown",
			duration: 0.17,
			gain: 0.025 + strength * 0.085,
			attack: 0.006,
			pan,
			filter: {
				type: "lowpass",
				frequency: kind === "main" ? 460 + strength * 760 : 360,
				Q: 0.7,
			},
			filterSweep: kind === "main" ? 1.32 : 0.8,
		});
		audio.tone({
			freq: (kind === "main" ? 43 : 35) + strength * 18,
			duration: 0.16,
			wave: "sawtooth",
			gain: 0.008 + strength * 0.022,
			attack: 0.004,
			pan,
			pitchSlide: kind === "main" ? 1.25 : 0.86,
		});
		return;
	}

	audio.noise({
		type: "white",
		duration: kind === "rotation" ? 0.055 : 0.085,
		gain: 0.02 + strength * 0.045,
		attack: 0.001,
		pan,
		filter: {
			type: "bandpass",
			frequency: kind === "rotation" ? 2100 : 1250,
			Q: 1.2,
		},
		filterSweep: kind === "rotation" ? 1.8 : 1.35,
	});
	audio.tone({
		freq: kind === "rotation" ? 390 : 240,
		duration: 0.06,
		wave: "square",
		gain: 0.01 + strength * 0.014,
		attack: 0.001,
		pan,
		pitchSlide: 1.4,
	});
}

export function playImpact(force: number, pan = 0): void {
	const weight = clamp(force / 240);
	audio.noise({
		type: "white",
		duration: 0.09 + weight * 0.15,
		gain: 0.07 + weight * 0.42,
		attack: 0.001,
		pan,
		filter: {
			type: "highpass",
			frequency: 850 - weight * 300,
			Q: 0.7,
		},
	});
	audio.noise({
		type: "brown",
		duration: 0.24 + weight * 0.72,
		gain: 0.08 + weight * 0.55,
		attack: 0.003,
		pan,
		filter: {
			type: "lowpass",
			frequency: 1100 - weight * 650,
			Q: 0.6,
		},
		filterSweep: 0.42,
	});
	audio.tone({
		freq: 92 - weight * 34,
		duration: 0.28 + weight * 0.7,
		wave: "sine",
		gain: 0.07 + weight * 0.38,
		attack: 0.002,
		pan,
		pitchSlide: 0.34,
	});
}

export function playDock(berth: number): void {
	const base = 540 + berth * 90;
	audio.tone({
		freq: [base, base * 1.5],
		duration: 0.28,
		wave: "sine",
		gain: 0.11,
		attack: 0.005,
		pitchSlide: 1.08,
	});
	audio.tone({
		freq: base * 2,
		duration: 0.16,
		wave: "triangle",
		gain: 0.055,
		attack: 0.003,
		delay: 0.1,
	});
}

export function playRecovery(): void {
	audio.tone({
		freq: [392, 587, 784],
		duration: 1.1,
		wave: "sine",
		gain: 0.12,
		attack: 0.03,
		pitchSlide: 1.18,
	});
	audio.tone({
		freq: [784, 1176],
		duration: 0.75,
		wave: "triangle",
		gain: 0.045,
		attack: 0.01,
		delay: 0.16,
	});
}

export function playFailure(): void {
	audio.noise({
		type: "brown",
		duration: 1.8,
		gain: 0.52,
		attack: 0.01,
		filter: { type: "lowpass", frequency: 760, Q: 0.6 },
		filterSweep: 0.2,
	});
	audio.tone({
		freq: [110, 76],
		duration: 1.4,
		wave: "sawtooth",
		gain: 0.13,
		attack: 0.01,
		pitchSlide: 0.36,
	});
}

export function playBoundary(): void {
	audio.noise({
		type: "pink",
		duration: 0.18,
		gain: 0.06,
		filter: { type: "bandpass", frequency: 620, Q: 1.4 },
		filterSweep: 0.65,
	});
}
