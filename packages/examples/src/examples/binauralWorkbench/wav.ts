/**
 * Minimal 16-bit PCM stereo WAV encoder. Takes the planar channel
 * buffers produced by an OfflineAudioContext render and returns a
 * downloadable Blob. No external dependencies or assets.
 */

const writeString = (view: DataView, offset: number, value: string) => {
	for (let i = 0; i < value.length; i += 1) {
		view.setUint8(offset + i, value.charCodeAt(i));
	}
};

const clampToInt16 = (sample: number): number => {
	const scaled = Math.max(-1, Math.min(1, sample)) * 32767;
	return (scaled < 0 ? scaled - 0.5 : scaled + 0.5) | 0;
};

/**
 * Encode planar mono/stereo float samples as a 16-bit PCM WAV Blob.
 * A mono buffer is duplicated to both channels so every export is
 * guaranteed a two-channel file.
 */
export const encodeWav = (
	sampleRate: number,
	channels: ReadonlyArray<Float32Array>,
): Blob => {
	const channelCount = 2;
	const left = channels[0];
	const right = channels[1] ?? left;
	const frameCount = left.length;
	const bytesPerSample = 2;
	const dataSize = frameCount * channelCount * bytesPerSample;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	writeString(view, 0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(view, 8, "WAVE");
	writeString(view, 12, "fmt ");
	view.setUint32(16, 16, true); // PCM chunk size
	view.setUint16(20, 1, true); // PCM format tag
	view.setUint16(22, channelCount, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
	view.setUint16(32, channelCount * bytesPerSample, true);
	view.setUint16(34, 8 * bytesPerSample, true);
	writeString(view, 36, "data");
	view.setUint32(40, dataSize, true);

	let offset = 44;
	for (let i = 0; i < frameCount; i += 1) {
		view.setInt16(offset, clampToInt16(left[i]), true);
		offset += 2;
		view.setInt16(offset, clampToInt16(right[i]), true);
		offset += 2;
	}

	return new Blob([buffer], { type: "audio/wav" });
};

/** true when a channel carries audible (non-zero) PCM energy. */
export const channelHasSignal = (data: Float32Array): boolean => {
	let peak = 0;
	for (let i = 0; i < data.length; i += 1) {
		const magnitude = Math.abs(data[i]);
		if (magnitude > peak) {
			peak = magnitude;
		}
	}
	return peak > 1e-4;
};
