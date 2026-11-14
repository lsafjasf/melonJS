/**
 * melonJS — Lighthouse Relay procedural audio.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Every cue is synthesised through `audio.tone` / `audio.noise`, so the
 * example has no audio assets to load. Cues are panned toward the player
 * they inform: P1 is left, P2 is right, and the shared station sits centre.
 */

import { audio } from "melonjs";
import type { Code } from "./constants";

export const playBeat = (beat: number): void => {
	audio.tone({
		freq: beat === 0 ? 720 : 470,
		duration: 0.035,
		wave: "square",
		gain: beat === 0 ? 0.025 : 0.014,
		pan: -0.18,
	});
};

export const playAim = (): void => {
	audio.tone({
		freq: 190,
		duration: 0.09,
		wave: "square",
		gain: 0.07,
		pan: -0.7,
		pitchSlide: 0.62,
	});
	audio.noise({
		duration: 0.1,
		type: "brown",
		gain: 0.035,
		pan: -0.75,
		filter: { type: "bandpass", frequency: 280, Q: 1.1 },
		filterSweep: 0.55,
	});
};

export const playBeamStart = (): void => {
	audio.tone({
		freq: [132, 264],
		duration: 0.16,
		wave: "triangle",
		gain: 0.09,
		pan: -0.55,
		pitchSlide: 1.18,
	});
	audio.noise({
		duration: 0.2,
		type: "pink",
		gain: 0.055,
		pan: -0.3,
		filter: { type: "bandpass", frequency: 900, Q: 1.6 },
		filterSweep: 1.9,
	});
};

export const playBeamStop = (): void => {
	audio.tone({
		freq: 210,
		duration: 0.08,
		wave: "square",
		gain: 0.055,
		pan: -0.55,
		pitchSlide: 0.52,
	});
};

export const playEchoPulse = (code: Code, index: number): void => {
	audio.tone({
		freq: code === "short" ? [880, 1320] : [440, 660],
		duration: code === "short" ? 0.12 : 0.34,
		wave: "triangle",
		gain: 0.12,
		pan: 0.72,
		pitchSlide: 0.97,
		delay: 0,
	});
	audio.tone({
		freq: 1760,
		duration: 0.035,
		wave: "sine",
		gain: 0.035,
		pan: 0.8,
	});
	if (index === 2) {
		audio.tone({
			freq: 990,
			duration: 0.06,
			gain: 0.025,
			pan: 0.75,
			delay: 0.13,
		});
	}
};

export const playSelect = (): void => {
	audio.tone({
		freq: 760,
		duration: 0.04,
		wave: "square",
		gain: 0.045,
		pan: 0.75,
	});
};

export const playSend = (): void => {
	audio.tone({
		freq: [392, 587],
		duration: 0.12,
		wave: "triangle",
		gain: 0.1,
		pan: 0.7,
	});
};

export const playError = (): void => {
	audio.tone({
		freq: 190,
		duration: 0.26,
		wave: "sawtooth",
		gain: 0.08,
		pan: 0.62,
		pitchSlide: 0.48,
	});
	audio.noise({
		duration: 0.18,
		type: "brown",
		gain: 0.045,
		pan: 0.55,
		filter: { type: "lowpass", frequency: 520 },
		filterSweep: 0.55,
	});
};

export const playHandshake = (): void => {
	audio.tone({
		freq: [523, 784],
		duration: 0.25,
		wave: "triangle",
		gain: 0.12,
	});
	audio.tone({
		freq: [659, 988],
		duration: 0.34,
		wave: "triangle",
		gain: 0.1,
		delay: 0.12,
	});
};

export const playHeatWarning = (): void => {
	audio.tone({
		freq: 176,
		duration: 0.09,
		wave: "square",
		gain: 0.045,
		pan: 0.35,
	});
	audio.tone({
		freq: 138,
		duration: 0.13,
		wave: "square",
		gain: 0.05,
		pan: 0.35,
		delay: 0.12,
	});
};

export const playHeatCritical = (): void => {
	audio.noise({
		duration: 0.35,
		type: "white",
		gain: 0.08,
		filter: { type: "highpass", frequency: 2600 },
		pan: 0.3,
	});
	audio.tone({
		freq: 118,
		duration: 0.42,
		wave: "sawtooth",
		gain: 0.085,
		pan: 0.25,
		pitchSlide: 0.66,
	});
};

export const playLensClear = (): void => {
	audio.tone({
		freq: [440, 660],
		duration: 0.18,
		wave: "sine",
		gain: 0.055,
		pan: 0.2,
		pitchSlide: 1.12,
	});
};

export const playWin = (): void => {
	audio.tone({
		freq: [262, 392, 523],
		duration: 0.7,
		wave: "triangle",
		gain: 0.13,
	});
	audio.tone({
		freq: [392, 523, 784],
		duration: 0.8,
		wave: "triangle",
		gain: 0.11,
		delay: 0.18,
	});
	audio.tone({
		freq: [523, 784, 1046],
		duration: 1.1,
		wave: "sine",
		gain: 0.09,
		delay: 0.38,
	});
	audio.noise({
		duration: 0.55,
		type: "white",
		gain: 0.025,
		filter: { type: "highpass", frequency: 4200 },
		delay: 0.2,
	});
};
