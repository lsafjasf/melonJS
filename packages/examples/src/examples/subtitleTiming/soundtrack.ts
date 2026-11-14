import { initialCues } from "./initialCues";
import { TRACK_DURATION_MS } from "./webvtt";

export type Soundtrack = {
	url: string;
	peaks: number[];
	durationMs: number;
	sampleRate: number;
};

const SAMPLE_RATE = 16_000;
const PEAK_COUNT = 1_800;
const TAU = Math.PI * 2;

const clamp = (value: number, min: number, max: number) => {
	return Math.min(max, Math.max(min, value));
};

const smoothStep = (value: number) => {
	const x = clamp(value, 0, 1);
	return x * x * (3 - 2 * x);
};

const voiceEnvelope = (local: number, duration: number) => {
	const attack = smoothStep(local / 0.08);
	const release = smoothStep((duration - local) / 0.12);
	const syllable = 0.34 + 0.66 * Math.abs(Math.sin(local * 7.4));
	return attack * release * syllable;
};

const makeSamples = () => {
	const durationSeconds = TRACK_DURATION_MS / 1_000;
	const samples = new Float32Array(Math.round(durationSeconds * SAMPLE_RATE));
	const cues = initialCues().map((cue) => {
		return {
			start: cue.start / 1_000,
			end: cue.end / 1_000,
		};
	});
	let seed = 0x6d2b79f5;
	const noise = () => {
		seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
		return (seed / 0xffffffff) * 2 - 1;
	};

	for (let index = 0; index < samples.length; index++) {
		const time = index / SAMPLE_RATE;
		const drift = Math.sin(TAU * 0.045 * time);
		let sample =
			0.035 * Math.sin(TAU * (110 + drift * 2) * time) +
			0.022 * Math.sin(TAU * 164.8 * time + 0.8) +
			0.014 * Math.sin(TAU * 220.4 * time + 1.7);

		sample += 0.01 * noise() * (0.5 + 0.5 * Math.sin(TAU * 0.2 * time));

		const beat = time % 2;
		if (beat < 0.14) {
			sample +=
				0.11 * Math.exp(-beat * 28) * Math.sin(TAU * (720 - beat * 900) * time);
		}

		for (const cue of cues) {
			if (time < cue.start || time >= cue.end) {
				continue;
			}
			const local = time - cue.start;
			const length = cue.end - cue.start;
			const envelope = voiceEnvelope(local, length);
			const pitch = 178 + 24 * Math.sin(TAU * 0.64 * local + 0.4);
			const voice =
				Math.sin(TAU * pitch * local) +
				0.42 * Math.sin(TAU * pitch * 2.02 * local + 0.7) +
				0.18 * Math.sin(TAU * pitch * 3.07 * local + 1.9);
			sample +=
				0.105 * envelope * voice +
				0.032 * envelope * noise() * Math.sin(TAU * 4.1 * local);
		}

		samples[index] = clamp(sample * 0.82, -0.98, 0.98);
	}

	return samples;
};

const makePeaks = (samples: Float32Array) => {
	const peaks: number[] = [];
	const bucketSize = samples.length / PEAK_COUNT;
	let maximum = 0;
	for (let bucket = 0; bucket < PEAK_COUNT; bucket++) {
		const start = Math.floor(bucket * bucketSize);
		const end = Math.min(samples.length, Math.floor((bucket + 1) * bucketSize));
		let peak = 0;
		for (let index = start; index < end; index++) {
			peak = Math.max(peak, Math.abs(samples[index] ?? 0));
		}
		peaks.push(peak);
		maximum = Math.max(maximum, peak);
	}
	const scale = maximum > 0 ? 1 / maximum : 1;
	return peaks.map((peak) => clamp(peak * scale, 0.02, 1));
};

const writeAscii = (view: DataView, offset: number, value: string) => {
	for (let index = 0; index < value.length; index++) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
};

const encodeWav = (samples: Float32Array) => {
	const bytesPerSample = 2;
	const dataLength = samples.length * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataLength);
	const view = new DataView(buffer);
	writeAscii(view, 0, "RIFF");
	view.setUint32(4, 36 + dataLength, true);
	writeAscii(view, 8, "WAVE");
	writeAscii(view, 12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * bytesPerSample, true);
	view.setUint16(32, bytesPerSample, true);
	view.setUint16(34, 16, true);
	writeAscii(view, 36, "data");
	view.setUint32(40, dataLength, true);
	for (let index = 0; index < samples.length; index++) {
		const value = clamp(samples[index] ?? 0, -1, 1);
		view.setInt16(
			44 + index * bytesPerSample,
			value < 0 ? value * 0x8000 : value * 0x7fff,
			true,
		);
	}
	return buffer;
};

let soundtrack: Soundtrack | undefined;

export const getSoundtrack = (): Soundtrack => {
	if (soundtrack) {
		return soundtrack;
	}
	const samples = makeSamples();
	const blob = new Blob([encodeWav(samples)], { type: "audio/wav" });
	soundtrack = {
		url: URL.createObjectURL(blob),
		peaks: makePeaks(samples),
		durationMs: TRACK_DURATION_MS,
		sampleRate: SAMPLE_RATE,
	};
	return soundtrack;
};
