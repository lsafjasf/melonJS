/**
 * melonJS — paper puppet show: procedural sound cues.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { audio } from "melonjs";

let lastRustle = 0;

export const playPaperRustle = (intensity = 0.5) => {
	const now = performance.now();
	if (now - lastRustle < 70) {
		return;
	}
	lastRustle = now;
	audio.noise({
		type: "pink",
		duration: 0.07 + intensity * 0.05,
		gain: 0.025 + intensity * 0.04,
		attack: 0.003,
		filter: {
			type: "bandpass",
			frequency: 950 + intensity * 900,
			Q: 0.7,
		},
	});
};

export const playCue = () => {
	audio.tone({
		freq: 392,
		duration: 0.13,
		gain: 0.12,
		pitchSlide: 1.12,
	});
	audio.tone({
		freq: [784, 1176],
		duration: 0.2,
		gain: 0.08,
		delay: 0.11,
	});
};

export const playSuccess = () => {
	audio.tone({
		freq: [523, 659],
		duration: 0.18,
		gain: 0.12,
	});
	audio.tone({
		freq: [659, 988],
		duration: 0.16,
		gain: 0.1,
		delay: 0.13,
	});
	audio.tone({
		freq: [784, 1176],
		duration: 0.24,
		gain: 0.09,
		delay: 0.26,
	});
};

export const playPenalty = () => {
	audio.noise({
		type: "brown",
		duration: 0.16,
		gain: 0.1,
		attack: 0.002,
		filter: { type: "lowpass", frequency: 420 },
	});
	audio.tone({
		freq: 196,
		duration: 0.24,
		gain: 0.08,
		wave: "sawtooth",
		pitchSlide: 0.55,
	});
};

export const playCurtain = () => {
	audio.noise({
		type: "pink",
		duration: 0.55,
		gain: 0.08,
		attack: 0.01,
		filterSweep: 0.3,
		pan: -0.2,
	});
	audio.tone({
		freq: [294, 440, 588],
		duration: 0.7,
		gain: 0.1,
		delay: 0.18,
	});
};
