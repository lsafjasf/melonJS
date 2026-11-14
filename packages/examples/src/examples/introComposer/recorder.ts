/**
 * melonJS — procedural intro composer: canvas + Web Audio recording.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { ProceduralScore } from "./audio";
import { FPS } from "./model";

const MIME_TYPES = [
	"video/webm;codecs=vp9,opus",
	"video/webm;codecs=vp8,opus",
	"video/webm;codecs=vp9",
	"video/webm;codecs=vp8",
	"video/webm",
];

export interface RecordingResult {
	blob: Blob;
	url: string;
	mimeType: string;
	duration: number;
	width: number;
	height: number;
}

const wait = (ms: number) =>
	new Promise<void>((resolve) => {
		window.setTimeout(resolve, ms);
	});

const pickMime = (): string => {
	if (typeof MediaRecorder === "undefined") {
		throw new Error("This browser does not support MediaRecorder.");
	}
	const mime = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
	if (!mime) {
		throw new Error("No WebM recording codec is available in this browser.");
	}
	return mime;
};

/**
 * Record the real-time canvas and score into one WebM. The score is routed
 * through the same graph as playback, so the captured audio is what is heard.
 */
export const recordTake = async (
	canvas: HTMLCanvasElement,
	score: ProceduralScore,
	duration: number,
	onProgress: (time: number) => void,
): Promise<RecordingResult> => {
	if (typeof canvas.captureStream !== "function") {
		throw new Error("canvas.captureStream() is not available in this browser.");
	}
	const mimeType = pickMime();
	const videoStream = canvas.captureStream(FPS);
	const audioDestination = score.captureDestination();
	const audioTrack = audioDestination.stream.getAudioTracks()[0];
	if (!audioTrack) {
		throw new Error("Could not create a Web Audio capture track.");
	}
	const stream = new MediaStream([...videoStream.getVideoTracks(), audioTrack]);
	const recorder = new MediaRecorder(stream, {
		mimeType,
		videoBitsPerSecond: 9_000_000,
		audioBitsPerSecond: 160_000,
	});
	const chunks: BlobPart[] = [];
	const finished = new Promise<void>((resolve, reject) => {
		recorder.onerror = () => {
			reject(new Error("The browser stopped the recording unexpectedly."));
		};
		recorder.onstop = () => {
			resolve();
		};
	});
	recorder.ondataavailable = (event) => {
		if (event.data.size > 0) {
			chunks.push(event.data);
		}
	};

	recorder.start(250);
	await wait(60);
	score.start(0, audioDestination);
	const started = performance.now();
	await new Promise<void>((resolve) => {
		const tick = () => {
			const elapsed = Math.min(duration, (performance.now() - started) / 1000);
			onProgress(elapsed);
			if (elapsed >= duration) {
				window.setTimeout(resolve, 140);
				return;
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	score.stop();
	const measured = Math.min(duration, (performance.now() - started) / 1000);
	if (recorder.state !== "inactive") {
		recorder.stop();
	}
	await finished;
	for (const track of stream.getTracks()) {
		track.stop();
	}
	audioDestination.disconnect();
	const blob = new Blob(chunks, { type: mimeType });
	if (blob.size === 0) {
		throw new Error("The recording produced no data.");
	}
	return {
		blob,
		url: URL.createObjectURL(blob),
		mimeType,
		duration: measured,
		width: canvas.width,
		height: canvas.height,
	};
};
