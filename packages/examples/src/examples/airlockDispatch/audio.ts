/**
 * melonJS — Airlock Dispatch example: procedural sound.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Every cue is generated through `audio.tone` / `audio.noise`; the example
 * ships no recorded audio and therefore needs no third-party credit.
 */
import { audio } from "melonjs";

/**
 * Short mechanical tick for route editing and buttons.
 */
export function playClick(): void {
	audio.tone({
		freq: 720,
		duration: 0.045,
		gain: 0.045,
		pitchSlide: 1.25,
		wave: "square",
	});
}

/**
 * A refused action, pitched low so it never reads as a successful click.
 */
export function playError(): void {
	audio.tone({
		freq: 150,
		duration: 0.14,
		gain: 0.08,
		pitchSlide: 0.55,
		wave: "triangle",
	});
}

/**
 * A lift's motor, called at a low but audible cadence while it travels.
 * @param elevatorIndex - stereo position across the three shafts
 */
export function playMotor(elevatorIndex: number): void {
	audio.tone({
		freq: 72 + elevatorIndex * 7,
		duration: 0.34,
		gain: 0.028,
		pan: -0.55 + elevatorIndex * 0.55,
		pitchSlide: 1.08,
		wave: "triangle",
	});
	audio.noise({
		duration: 0.2,
		gain: 0.012,
		pan: -0.55 + elevatorIndex * 0.55,
		filter: { type: "lowpass", frequency: 240, Q: 0.8 },
	});
}

/**
 * The airlock's door servos opening, with escaping-pressure noise.
 */
export function playDoorOpen(): void {
	audio.tone({
		freq: [310, 220],
		duration: 0.3,
		gain: 0.07,
		pitchSlide: 0.62,
		wave: "sawtooth",
	});
	audio.noise({
		duration: 0.42,
		gain: 0.075,
		type: "pink",
		filter: { type: "bandpass", frequency: 720, Q: 0.7 },
		filterSweep: 0.25,
	});
}

/**
 * A deck's pressure seal returning to 100%.
 * @param deck - deck number, used for a subtle stereo tilt
 */
export function playPressureReady(deck: number): void {
	audio.tone({
		freq: 480 + deck * 18,
		duration: 0.26,
		gain: 0.055,
		pan: (deck - 3) / 4,
		pitchSlide: 1.35,
	});
}

/**
 * The two-note priority alarm that warns a high-priority pod is close to
 * missing its window.
 */
export function playPriorityAlarm(): void {
	audio.tone({
		freq: 920,
		duration: 0.1,
		gain: 0.075,
		wave: "square",
	});
	audio.tone({
		freq: 690,
		duration: 0.12,
		gain: 0.065,
		delay: 0.13,
		wave: "square",
	});
}

/**
 * Failure sting: a pressure drop, a dark bass pulse, and the alarm tail.
 */
export function playFailure(): void {
	audio.noise({
		duration: 0.8,
		gain: 0.22,
		type: "brown",
		filter: { type: "lowpass", frequency: 820, Q: 0.7 },
		filterSweep: 0.15,
	});
	audio.tone({
		freq: 170,
		duration: 0.42,
		gain: 0.16,
		wave: "triangle",
		pitchSlide: 0.35,
	});
	audio.tone({
		freq: 760,
		duration: 0.12,
		gain: 0.1,
		delay: 0.05,
		wave: "square",
	});
	audio.tone({
		freq: 610,
		duration: 0.16,
		gain: 0.1,
		delay: 0.2,
		wave: "square",
	});
}

/**
 * Delivery fanfare for a complete eight-pod run.
 */
export function playVictory(): void {
	const notes = [392, 523, 659, 784];
	for (let index = 0; index < notes.length; index++) {
		audio.tone({
			freq: notes[index],
			duration: 0.32,
			gain: 0.11,
			delay: index * 0.11,
			wave: "triangle",
		});
	}
	audio.noise({
		duration: 0.32,
		gain: 0.05,
		filter: { type: "highpass", frequency: 1800 },
	});
}
