/**
 * melonJS — subtitle editor: audio waveform peaks.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The clip's audio is decoded once with the Web Audio API and reduced to
 * peak/min RMS buckets. The buckets are tiled across the full 40 s timeline
 * with the same `time % sourceDuration` mapping the Transport uses, so the
 * waveform cursor and the picture can never disagree about where zero is.
 */

/** one waveform column: peak 0..1 and average loudness 0..1 */
export interface WavePeak {
	peak: number;
	rms: number;
}

/**
 * Decode the file behind a media element into per-bucket peaks.
 * `buckets` is the column count for the whole source clip, not the timeline.
 */
export const decodePeaks = async (
	url: string,
	buckets: number,
): Promise<WavePeak[]> => {
	const response = await fetch(url);
	const arrayBuffer = await response.arrayBuffer();
	const AudioContextCtor =
		window.AudioContext ??
		(
			window as unknown as {
				webkitAudioContext?: typeof AudioContext;
			}
		).webkitAudioContext;
	if (!AudioContextCtor) {
		throw new Error("Web Audio is not available in this browser.");
	}
	const context = new AudioContextCtor();
	try {
		const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0));
		// mix every channel down to mono before bucketing
		const channels = audioBuffer.numberOfChannels;
		const length = audioBuffer.length;
		const mixed = new Float32Array(length);
		for (let channel = 0; channel < channels; channel++) {
			const data = audioBuffer.getChannelData(channel);
			for (let i = 0; i < length; i++) {
				mixed[i] += data[i] / channels;
			}
		}

		const peaks: WavePeak[] = [];
		const bucketSize = Math.max(1, Math.floor(length / buckets));
		for (let bucket = 0; bucket < buckets; bucket++) {
			const start = bucket * bucketSize;
			const end = Math.min(length, start + bucketSize);
			let peak = 0;
			let sumSquares = 0;
			let samples = 0;
			for (let i = start; i < end; i++) {
				const value = Math.abs(mixed[i]);
				if (value > peak) {
					peak = value;
				}
				sumSquares += mixed[i] * mixed[i];
				samples++;
			}
			const rms = samples > 0 ? Math.sqrt(sumSquares / samples) : 0;
			peaks.push({ peak, rms });
		}
		return peaks;
	} finally {
		void context.close();
	}
};

/**
 * Peak for a timeline position: the source clip repeats, so wrap with the
 * source duration and look up the matching source bucket.
 */
export const peakAt = (
	peaks: WavePeak[],
	sourceDuration: number,
	timelineTime: number,
): WavePeak => {
	if (peaks.length === 0) {
		return { peak: 0, rms: 0 };
	}
	const wrapped = timelineTime % sourceDuration;
	const index = Math.min(
		peaks.length - 1,
		Math.floor((wrapped / sourceDuration) * peaks.length),
	);
	return peaks[index] ?? { peak: 0, rms: 0 };
};
