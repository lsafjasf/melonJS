/**
 * melonJS — audio restoration lab: offline rendering and WAV export.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * The export path never touches the live graph: it builds a fresh
 * `OfflineAudioContext`, plays the immutable source buffer through a second
 * `RestorationChain` configured with the current UI settings, renders the
 * whole ten seconds as fast as the machine allows, and encodes the result
 * as 16-bit PCM WAV.
 */

import {
	type BypassState,
	type ClipCounters,
	type RepairParams,
	RestorationChain,
} from "./chain";

export interface OfflineRenderResult {
	/** the rendered, repaired buffer (a new buffer; the source is untouched) */
	buffer: AudioBuffer;
	/** exact clip counts measured by the offline chain's worklets */
	clips: ClipCounters;
}

/**
 * Renders the source buffer through an offline copy of the repair chain.
 * The source buffer is only read, never modified.
 */
export const renderOffline = async (
	source: AudioBuffer,
	params: RepairParams,
	bypass: BypassState,
): Promise<OfflineRenderResult> => {
	const off = new OfflineAudioContext(
		source.numberOfChannels,
		source.length,
		source.sampleRate,
	);
	const chain = await RestorationChain.create(off);
	chain.applyParams(params);
	chain.applyBypass(bypass);
	chain.output.connect(off.destination);

	const bufferSource = off.createBufferSource();
	bufferSource.buffer = source;
	bufferSource.connect(chain.input);
	bufferSource.start(0);

	const buffer = await off.startRendering();
	const clips = chain.readClipCounters();
	chain.dispose();
	return { buffer, clips };
};

/**
 * Encodes an `AudioBuffer` as a 16-bit PCM WAV `Blob` (PCM s16, the classic
 * `.wav` container). Supports mono and multi-channel buffers.
 */
export const encodeWav = (buffer: AudioBuffer): Blob => {
	const channels = buffer.numberOfChannels;
	const sampleRate = buffer.sampleRate;
	const frames = buffer.length;
	const bytesPerSample = 2;
	const blockAlign = channels * bytesPerSample;
	const dataSize = frames * blockAlign;
	const bufferBytes = 44 + dataSize;

	const arrayBuffer = new ArrayBuffer(bufferBytes);
	const view = new DataView(arrayBuffer);

	const writeAscii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i += 1) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};

	// RIFF header
	writeAscii(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeAscii(8, "WAVE");

	// fmt chunk: PCM format tag 1
	writeAscii(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, 16, true);

	// data chunk, channels interleaved
	writeAscii(36, "data");
	view.setUint32(40, dataSize, true);

	const channelData: Float32Array[] = [];
	for (let channel = 0; channel < channels; channel += 1) {
		channelData.push(buffer.getChannelData(channel));
	}

	let offset = 44;
	for (let frame = 0; frame < frames; frame += 1) {
		for (let channel = 0; channel < channels; channel += 1) {
			const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
			const int16 = sample < 0 ? sample * 0x8000 : Math.round(sample * 0x7fff);
			view.setInt16(offset, int16, true);
			offset += 2;
		}
	}

	return new Blob([arrayBuffer], { type: "audio/wav" });
};

/** triggers a browser download of a Blob under the given file name */
export const downloadBlob = (blob: Blob, fileName: string): void => {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	// revoke on the next tick so the download has time to start
	setTimeout(() => URL.revokeObjectURL(url), 0);
};
