/**
 * melonJS — A/V sync lab example: preview recording + measured verification.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

/** result of measuring one recorded preview */
export type PreviewMeasurement = {
	/** measured audio-vs-flash delay, ms: positive = flash (video) late */
	measuredDelayMs: number;
	/** media time of the first detected flash, seconds into the clip */
	flashAtSec: number;
	/** media time of the first detected beat onset, seconds into the clip */
	onsetAtSec: number;
};

export type RecordedPreview = {
	blob: Blob;
	url: string;
	mimeType: string;
	measurement: PreviewMeasurement;
};

/**
 * Capture the canvas plus the beat track into one webm blob.
 * Resolves once `durationSec` of media has been recorded.
 */
export const recordPreview = async (
	canvas: HTMLCanvasElement,
	audioStream: MediaStream,
	durationSec: number,
): Promise<{ blob: Blob; mimeType: string }> => {
	const videoStream = canvas.captureStream(60);
	const combined = new MediaStream([
		...videoStream.getVideoTracks(),
		...audioStream.getAudioTracks(),
	]);
	const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
		? "video/webm;codecs=vp9,opus"
		: "video/webm";
	const recorder = new MediaRecorder(combined, {
		mimeType,
		videoBitsPerSecond: 2_500_000,
	});
	const chunks: BlobPart[] = [];
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			chunks.push(event.data);
		}
	};
	const stopped = new Promise<void>((resolve) => {
		recorder.onstop = () => resolve();
	});
	recorder.start(200);
	await new Promise((resolve) => {
		globalThis.setTimeout(resolve, durationSec * 1000);
	});
	recorder.stop();
	await stopped;
	return { blob: new Blob(chunks, { type: mimeType }), mimeType };
};

/**
 * Measure the real audio/video delay inside a recorded preview.
 *
 * The video track is decoded frame by frame to find the first bright flash;
 * the audio track is decoded to PCM and scanned for the first beat onset.
 * The difference `flash - onset` is the actual deviation, using the same
 * sign convention as the UI: positive means the flash lands after the
 * sound, i.e. the video is late.
 */
export const measurePreview = async (
	blob: Blob,
): Promise<PreviewMeasurement> => {
	const arrayBuffer = await blob.arrayBuffer();
	const audioCtx = new OfflineAudioContext(1, 1, 48000);
	const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
	const onsetAtSec = findFirstOnset(audioBuffer);
	const flashAtSec = await findFirstFlash(blob);
	return {
		measuredDelayMs: (flashAtSec - onsetAtSec) * 1000,
		flashAtSec,
		onsetAtSec,
	};
};

/** synthesized beats reach ~0.24 RMS; recorder startup transients stay below */
const ONSET_RMS_THRESHOLD = 0.15;

/** ignore the first 50 ms, which can hold a recorder startup transient */
const ONSET_HEAD_START_SEC = 0.05;

/**
 * First beat onset: the first 10 ms window past the head start whose RMS
 * energy clearly exceeds the startup-noise floor. The synthesized clicks
 * have a sharp attack, so the gate lands within a few milliseconds.
 */
const findFirstOnset = (buffer: AudioBuffer): number => {
	const data = buffer.getChannelData(0);
	const sampleRate = buffer.sampleRate;
	const windowSize = Math.floor(sampleRate * 0.01);
	const headStart = Math.floor(sampleRate * ONSET_HEAD_START_SEC);
	for (
		let start = headStart;
		start + windowSize < data.length;
		start += windowSize
	) {
		let energy = 0;
		for (let index = start; index < start + windowSize; index++) {
			energy += data[index] * data[index];
		}
		if (Math.sqrt(energy / windowSize) >= ONSET_RMS_THRESHOLD) {
			return start / sampleRate;
		}
	}
	return 0;
};

/** the renderer's known dark-track luma; see `FlashRenderer.render` */
const DARK_BASELINE_LUMA = 25;

/** a flash attack must exceed the dark baseline by at least this much */
const FLASH_LUMA_JUMP = 80;

/** safety timeout so a clip that never flashes cannot hang the promise */
const FLASH_SCAN_TIMEOUT_MS = 8000;

/**
 * First flash frame: decode the clip into a hidden `<video>` and scan
 * frames via `requestVideoFrameCallback`, watching mean luma jump above
 * the dark baseline. The clip can start on a decaying flash, so the fixed
 * renderer baseline — not the first frame — is the reference.
 */
const findFirstFlash = (blob: Blob): Promise<number> => {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		const url = URL.createObjectURL(blob);
		let settled = false;
		const cleanup = () => {
			URL.revokeObjectURL(url);
			video.remove();
		};
		const finish = (time: number) => {
			if (settled) {
				return;
			}
			settled = true;
			cleanup();
			resolve(time);
		};

		video.muted = true;
		video.playsInline = true;
		video.src = url;

		const probe = document.createElement("canvas");
		probe.width = 64;
		probe.height = 64;
		const probeCtx = probe.getContext("2d", { willReadFrequently: true });
		if (!probeCtx) {
			reject(new Error("probe 2D context unavailable"));
			return;
		}

		const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
			probeCtx.drawImage(video, 0, 0, 64, 64);
			const pixels = probeCtx.getImageData(0, 0, 64, 64).data;
			let total = 0;
			for (let index = 0; index < pixels.length; index += 4) {
				total += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
			}
			const meanLuma = total / (64 * 64);
			if (meanLuma - DARK_BASELINE_LUMA > FLASH_LUMA_JUMP) {
				finish(metadata.mediaTime);
				return;
			}
			if (video.ended) {
				finish(metadata.mediaTime);
				return;
			}
			video.requestVideoFrameCallback(onFrame);
		};

		video.requestVideoFrameCallback(onFrame);
		video.play().catch(reject);
		globalThis.setTimeout(
			() => finish(video.currentTime),
			FLASH_SCAN_TIMEOUT_MS,
		);
	});
};
