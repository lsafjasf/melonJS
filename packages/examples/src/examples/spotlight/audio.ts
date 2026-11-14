/**
 * melonJS — The Last Spotlight example: procedural theatre sound.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Everything here is generated with `audio.tone` / `audio.noise`, so the
 * example ships no audio files and requires no loader pass.
 */
import { audio } from "melonjs";

const clampPan = (x: number): number =>
	Math.max(-0.8, Math.min(0.8, (x / 1200) * 1.58 - 0.79));

export const playCueBell = (): void => {
	audio.tone({ freq: 988, duration: 0.18, gain: 0.08, wave: "sine" });
	audio.tone({ freq: 1319, duration: 0.36, gain: 0.055, delay: 0.035 });
	audio.tone({ freq: 1976, duration: 0.28, gain: 0.025, delay: 0.08 });
};

export const playFootstep = (x: number, beat: number): void => {
	const pan = clampPan(x);
	audio.noise({
		duration: 0.065,
		type: "brown",
		gain: 0.045,
		pan,
		filter: { type: "lowpass", frequency: beat % 2 === 0 ? 680 : 580 },
	});
	audio.tone({
		freq: beat % 2 === 0 ? 92 : 82,
		duration: 0.05,
		gain: 0.018,
		pan,
		wave: "triangle",
	});
};

export const playModeSwitch = (index: number): void => {
	audio.tone({
		freq: [440, 523, 659][index] ?? 440,
		duration: 0.09,
		gain: 0.045,
		wave: "triangle",
		pitchSlide: 1.08,
	});
	audio.noise({
		duration: 0.035,
		type: "white",
		gain: 0.018,
		filter: { type: "highpass", frequency: 1800 },
	});
};

export const playCleanCue = (): void => {
	audio.noise({
		duration: 0.34,
		type: "pink",
		gain: 0.025,
		pan: 0.2,
		filter: { type: "bandpass", frequency: 1200, Q: 0.8 },
	});
};

export const playMissedCue = (): void => {
	audio.noise({
		duration: 0.52,
		type: "pink",
		gain: 0.07,
		filter: { type: "lowpass", frequency: 520 },
	});
	audio.tone({
		freq: 196,
		duration: 0.38,
		gain: 0.035,
		wave: "triangle",
		pitchSlide: 0.7,
	});
};

export const playWindowGlare = (): void => {
	audio.noise({
		duration: 0.2,
		type: "white",
		gain: 0.11,
		filter: { type: "highpass", frequency: 2400 },
	});
	audio.tone({
		freq: [1250, 880, 1490],
		duration: 0.56,
		gain: 0.08,
		delay: 0.03,
		pitchSlide: 1.4,
	});
	audio.noise({
		duration: 0.55,
		type: "pink",
		gain: 0.08,
		delay: 0.1,
		filter: { type: "bandpass", frequency: 900, Q: 0.6 },
	});
};

export const playHouseGasp = (): void => {
	audio.noise({
		duration: 0.48,
		type: "pink",
		gain: 0.055,
		filter: { type: "lowpass", frequency: 900 },
	});
	audio.tone({
		freq: [220, 185],
		duration: 0.34,
		gain: 0.024,
		wave: "triangle",
		pitchSlide: 0.64,
	});
};

export const playApplause = (): void => {
	for (let i = 0; i < 7; i++) {
		audio.noise({
			duration: 0.22 + (i % 3) * 0.04,
			type: "pink",
			gain: 0.026,
			delay: i * 0.075,
			pan: i % 2 === 0 ? -0.35 : 0.35,
			filter: { type: "bandpass", frequency: 900 + i * 70, Q: 0.7 },
		});
	}
	audio.tone({ freq: [523, 659, 784], duration: 0.7, gain: 0.045, delay: 0.2 });
};

export const playBoo = (): void => {
	audio.noise({
		duration: 0.8,
		type: "brown",
		gain: 0.07,
		filter: { type: "lowpass", frequency: 340 },
	});
	audio.tone({
		freq: [196, 165, 139],
		duration: 0.74,
		gain: 0.04,
		wave: "sawtooth",
		delay: 0.08,
		pitchSlide: 0.84,
	});
};

export const playCurtainCall = (): void => {
	audio.tone({ freq: [392, 523], duration: 0.45, gain: 0.06, delay: 0.1 });
	audio.tone({
		freq: [659, 784, 1047],
		duration: 0.9,
		gain: 0.07,
		delay: 0.5,
		wave: "triangle",
	});
	playApplause();
};
