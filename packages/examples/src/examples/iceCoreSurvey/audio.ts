/**
 * melonJS — Ice Core Survey: procedural sound.
 *
 * The motor is a short seamless WAV loop so its pitch can track the throttle;
 * cracks and impacts layer the engine's `audio.tone` / `audio.noise`
 * primitives. No external audio files, no download, and the same deterministic
 * motor on every run.
 *
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { audio } from "melonjs";

export const ENGINE_CLIP = "iceSurveyEngine";
const RATE = 22050;
const LOOP_SECONDS = 2;

let engineVoice: number | undefined;
let audioStarted = false;
let muted = false;
let lastCrackAt = 0;

function packWav(samples: Float32Array) {
	const bytes = new ArrayBuffer(44 + samples.length * 2);
	const view = new DataView(bytes);
	const ascii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i++) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};
	ascii(0, "RIFF");
	view.setUint32(4, 36 + samples.length * 2, true);
	ascii(8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, RATE, true);
	view.setUint32(28, RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	ascii(36, "data");
	view.setUint32(40, samples.length * 2, true);
	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		view.setInt16(44 + i * 2, clamped * 0x7fff, true);
	}
	let binary = "";
	const raw = new Uint8Array(bytes);
	for (let i = 0; i < raw.length; i++) {
		binary += String.fromCharCode(raw[i]);
	}
	return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * A two-second motor loop. Every partial completes a whole number of cycles
 * in the loop, so there is no seam at the restart.
 */
function makeEngineLoop() {
	const count = RATE * LOOP_SECONDS;
	const samples = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		const t = i / RATE;
		const phase = Math.PI * 2;
		const body =
			Math.sin(phase * 45 * t) * 0.095 +
			Math.sin(phase * 90 * t + 0.8) * 0.045 +
			Math.sin(phase * 180 * t + 1.7) * 0.018;
		const commutator = 0.72 + 0.28 * Math.sin(phase * 8 * t);
		const tread = 0.9 + 0.1 * Math.sin(phase * 34 * t);
		samples[i] = body * commutator * tread;
	}
	return packWav(samples);
}

/** Loader entry for the generated motor. */
export function audioAssets() {
	return [
		{
			name: ENGINE_CLIP,
			type: "audio" as const,
			src: makeEngineLoop(),
		},
	];
}

export function startAudio() {
	if (audioStarted) {
		return;
	}
	audioStarted = true;
	try {
		engineVoice = audio.play(ENGINE_CLIP, {
			loop: true,
			volume: 0.11,
		});
	} catch {
		engineVoice = undefined;
	}
}

export function updateEngine(speed: number, throttle: number) {
	if (engineVoice === undefined) {
		return;
	}
	const rate = 0.62 + Math.min(1, Math.abs(speed) / 172) * 0.78;
	try {
		audio.rate(ENGINE_CLIP, rate, engineVoice);
	} catch {
		// The clip can be unavailable in a browser that gates WebAudio; the
		// game must stay playable without it.
	}
	if (Math.abs(throttle) < 0.05 && Math.abs(speed) < 1) {
		try {
			audio.rate(ENGINE_CLIP, 0.56, engineVoice);
		} catch {
			// see above
		}
	}
}

export function stopAudio() {
	if (engineVoice !== undefined) {
		try {
			audio.stop(ENGINE_CLIP, engineVoice);
		} catch {
			// already gone
		}
		engineVoice = undefined;
	}
	audioStarted = false;
}

export function toggleMute() {
	muted = !muted;
	if (muted) {
		audio.muteAll();
	} else {
		audio.unmuteAll();
	}
	return muted;
}

export function isMuted() {
	return muted;
}

/** A fracture propagating: glassy tick plus a low pressure thump. */
export function playCrack(intensity: number) {
	const now = globalThis.performance.now();
	if (now - lastCrackAt < 95) {
		return;
	}
	lastCrackAt = now;
	const gain = 0.1 + Math.min(1, intensity) * 0.14;
	audio.noise({
		type: "white",
		duration: 0.07 + intensity * 0.07,
		gain,
		attack: 0.001,
		filter: { type: "highpass", frequency: 1350, Q: 0.8 },
	});
	audio.tone({
		freq: [1180 + intensity * 480, 1780 + intensity * 320],
		duration: 0.12,
		wave: "triangle",
		gain: gain * 0.46,
		attack: 0.001,
		pitchSlide: 0.82,
	});
	audio.tone({
		freq: 92,
		duration: 0.2,
		wave: "sine",
		gain: 0.035,
		pitchSlide: 0.6,
	});
}

/** Core barrel seating into the rack. */
export function playSample() {
	audio.tone({ freq: 390, duration: 0.11, wave: "square", gain: 0.07 });
	audio.tone({
		freq: 520,
		duration: 0.14,
		wave: "square",
		gain: 0.06,
		delay: 0.1,
	});
	audio.tone({
		freq: 780,
		duration: 0.34,
		wave: "triangle",
		gain: 0.05,
		delay: 0.2,
	});
	audio.noise({
		type: "brown",
		duration: 0.22,
		gain: 0.1,
		attack: 0.005,
		filter: { type: "lowpass", frequency: 500, Q: 0.7 },
	});
}

export function playJettison() {
	audio.tone({
		freq: 620,
		duration: 0.34,
		wave: "sawtooth",
		gain: 0.065,
		pitchSlide: 0.38,
	});
	audio.tone({
		freq: 92,
		duration: 0.28,
		wave: "sine",
		gain: 0.09,
		pitchSlide: 0.54,
	});
}

export function playSplash() {
	audio.noise({
		type: "brown",
		duration: 1.2,
		gain: 0.34,
		attack: 0.008,
		filter: { type: "lowpass", frequency: 780, Q: 0.7 },
		filterSweep: 0.34,
	});
	audio.tone({
		freq: 66,
		duration: 1.1,
		wave: "sine",
		gain: 0.14,
		pitchSlide: 0.45,
	});
	audio.noise({
		type: "white",
		duration: 0.26,
		gain: 0.17,
		attack: 0.001,
		filter: { type: "highpass", frequency: 1500, Q: 0.8 },
		filterSweep: 0.45,
	});
}

export function playSuccess(full: boolean) {
	const notes = full ? [392, 523.25, 659.25, 783.99] : [392, 523.25];
	notes.forEach((freq, index) => {
		audio.tone({
			freq,
			duration: 0.7,
			wave: "triangle",
			gain: 0.08,
			delay: index * 0.12,
		});
	});
}

export function playFailure() {
	audio.tone({
		freq: [164, 123],
		duration: 1.4,
		wave: "sawtooth",
		gain: 0.12,
		pitchSlide: 0.4,
	});
	audio.noise({
		type: "brown",
		duration: 1.5,
		gain: 0.2,
		filter: { type: "lowpass", frequency: 410, Q: 0.6 },
		filterSweep: 0.35,
	});
}
