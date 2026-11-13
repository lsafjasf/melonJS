/**
 * melonJS — audio restoration lab: the live engine + graph controller.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Owns the melonJS `Application` (the engine is still the page host, per
 * the example conventions) and the live Web Audio repair graph. The graph
 * runs on melonJS's own `AudioContext` from `audio.getAudioContext()` and
 * feeds the engine's master gain, so `audio.setVolume` / mute still apply.
 */

import { Application, audio, Color, Text } from "melonjs";
import {
	type BypassState,
	type ClipCounters,
	DEFAULT_BYPASS,
	DEFAULT_PARAMS,
	type RepairParams,
	RestorationChain,
} from "./chain";
import { downloadBlob, encodeWav, renderOffline } from "./exportWav";
import { synthesizeOldRecording } from "./synthesis";

/** the window-level test surface the acceptance script drives */
export interface RestorationLabApi {
	readonly ready: boolean;
	exportWav(): Promise<{
		duration: number;
		length: number;
		sampleRate: number;
		clips: ClipCounters;
		bytes: number;
	}>;
	/** renders one node bypassed at a time and reports how much it moves */
	compareEachBypass(): Promise<
		Record<
			keyof BypassState,
			{ differ: boolean; maxDifference: number; meanDifference: number }
		>
	>;
	/**
	 * Renders the current settings twice — once as configured and once with
	 * every node bypassed — and reports whether the two outputs differ, with
	 * a measure of how much. Proves a bypass actually changes the output.
	 */
	compareBypass(): Promise<{
		differ: boolean;
		maxDifference: number;
		meanDifference: number;
	}>;
	/** facts about the immutable source buffer, for test assertions */
	sourceFacts(): {
		duration: number;
		length: number;
		sampleRate: number;
		numberOfChannels: number;
	};
	/** live clip counts from the running graph's worklets */
	liveClips(): ClipCounters;
	/** starts or stops live playback; resolves once the state flips */
	setPlaying(playing: boolean): Promise<void>;
	/** whether the live source is currently running */
	isPlaying(): boolean;
}

declare global {
	interface Window {
		__restorationLab?: RestorationLabApi;
	}
}

const APP_WIDTH = 960;
const APP_HEIGHT = 120;

/** singleton controller: one engine and one repair graph per page load */
export class RestorationLab {
	private app: Application | null = null;
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private chain: RestorationChain | null = null;
	private source: AudioBufferSourceNode | null = null;

	/** the damaged recording; never reassigned or written to after build */
	private recording: AudioBuffer | null = null;
	private seed = 1;
	private playing = false;
	/** in-flight start, so StrictMode's double mount shares one boot */
	private startPromise: Promise<void> | null = null;

	params: RepairParams = { ...DEFAULT_PARAMS };
	bypass: BypassState = { ...DEFAULT_BYPASS };

	/** boots the engine, synthesizes the recording and builds the graph */
	start(): Promise<void> {
		if (this.startPromise) {
			return this.startPromise;
		}
		this.startPromise = this.boot().catch((error: unknown) => {
			// allow a later mount to retry the boot rather than caching
			// a rejected promise forever
			this.startPromise = null;
			throw error;
		});
		return this.startPromise;
	}

	private async boot(): Promise<void> {
		// The melonJS Application outlives React StrictMode's dev double
		// mount (the example host re-parents its canvas), so it is created
		// once; the audio graph and recording are rebuilt on every mount.
		if (this.app === null) {
			if (!audio.init("wav")) {
				throw new Error("Web Audio is not available in this browser.");
			}

			this.app = new Application(APP_WIDTH, APP_HEIGHT, {
				parent: "screen",
				scale: "auto",
				backgroundColor: "#202020",
			});
			await this.app.init();
			this.app.world.addChild(
				new Text(APP_WIDTH / 2, APP_HEIGHT / 2, {
					font: "Arial",
					size: 26,
					fillStyle: new Color(224, 224, 224),
					textAlign: "center",
					textBaseline: "middle",
					text: "Audio Restoration Lab — melonJS Web Audio",
				}),
			);

			this.context = audio.getAudioContext();
			this.master = audio.getMasterGain();
			if (!this.context || !this.master) {
				throw new Error("melonJS did not provide a Web Audio context.");
			}
		}
		await this.buildGraph();
	}

	/** (re)creates the immutable source buffer and its repair graph */
	private async buildGraph(): Promise<void> {
		if (!this.context || !this.master) {
			throw new Error("melonJS did not provide a Web Audio context.");
		}
		this.recording = await synthesizeOldRecording(this.seed);
		this.chain = await RestorationChain.create(this.context);
		this.chain.applyParams(this.params);
		this.chain.applyBypass(this.bypass);
		this.chain.output.connect(this.master);

		window.__restorationLab = this.buildApi();
	}

	getInputAnalyser(): AnalyserNode | null {
		return this.chain?.inputAnalyser ?? null;
	}

	getOutputAnalyser(): AnalyserNode | null {
		return this.chain?.outputAnalyser ?? null;
	}

	isPlaying(): boolean {
		return this.playing;
	}

	/** resumes the context (autoplay policy) and starts the looping source */
	async play(): Promise<void> {
		if (!this.context || !this.recording || !this.chain || this.playing) {
			return;
		}
		await this.context.resume();
		const node = this.context.createBufferSource();
		node.buffer = this.recording;
		node.loop = true;
		node.connect(this.chain.input);
		node.start();
		this.source = node;
		this.playing = true;
	}

	/** stops the live source; the source buffer itself is untouched */
	stop(): void {
		if (this.source) {
			try {
				this.source.stop();
			} catch {
				// already stopped: nothing to do
			}
			this.source.disconnect();
			this.source = null;
		}
		this.playing = false;
	}

	async togglePlayback(): Promise<void> {
		if (this.playing) {
			this.stop();
		} else {
			await this.play();
		}
	}

	/** live parameter update straight onto the running nodes */
	setParams(patch: Partial<RepairParams>): void {
		this.params = { ...this.params, ...patch };
		this.chain?.applyParams(this.params);
	}

	/** live bypass switch; the graph wiring never changes */
	setBypass(patch: Partial<BypassState>): void {
		this.bypass = { ...this.bypass, ...patch };
		this.chain?.applyBypass(this.bypass);
	}

	readClipCounters(): ClipCounters {
		return this.chain?.readClipCounters() ?? { input: 0, output: 0 };
	}

	/** synthesizes a fresh take (new seed), rebuilding the source only */
	async regenerate(): Promise<void> {
		this.seed += 1;
		const wasPlaying = this.playing;
		this.stop();
		this.recording = await synthesizeOldRecording(this.seed);
		if (wasPlaying) {
			await this.play();
		}
	}

	/**
	 * Offline-renders the current settings, encodes a WAV and downloads it.
	 * Returns the facts the UI and tests assert on. The live graph and the
	 * source buffer are not involved in the render.
	 */
	async exportWav(): Promise<{
		duration: number;
		length: number;
		sampleRate: number;
		clips: ClipCounters;
		bytes: number;
	}> {
		if (!this.recording) {
			throw new Error("Recording not synthesized yet.");
		}
		const { buffer, clips } = await renderOffline(
			this.recording,
			this.params,
			this.bypass,
		);
		const blob = encodeWav(buffer);
		downloadBlob(blob, "restored-recording.wav");
		return {
			duration: buffer.duration,
			length: buffer.length,
			sampleRate: buffer.sampleRate,
			clips,
			bytes: blob.size,
		};
	}

	private async compareBypass(): Promise<{
		differ: boolean;
		maxDifference: number;
		meanDifference: number;
	}> {
		if (!this.recording) {
			throw new Error("Recording not synthesized yet.");
		}
		const allBypassed: BypassState = {
			highpass: true,
			lowpass: true,
			notch: true,
			gate: true,
			softClip: true,
		};
		const [repaired, passthrough] = await Promise.all([
			renderOffline(this.recording, this.params, this.bypass),
			renderOffline(this.recording, this.params, allBypassed),
		]);
		const a = repaired.buffer.getChannelData(0);
		const b = passthrough.buffer.getChannelData(0);
		let maxDifference = 0;
		let sum = 0;
		for (let i = 0; i < a.length; i += 1) {
			const difference = Math.abs(a[i] - b[i]);
			maxDifference = Math.max(maxDifference, difference);
			sum += difference;
		}
		const meanDifference = sum / a.length;
		return {
			differ: maxDifference > 1e-6,
			maxDifference,
			meanDifference,
		};
	}

	private async compareEachBypass() {
		if (!this.recording) {
			throw new Error("Recording not synthesized yet.");
		}
		const result = {} as Record<
			keyof BypassState,
			{ differ: boolean; maxDifference: number; meanDifference: number }
		>;
		const keys = ["highpass", "lowpass", "notch", "gate", "softClip"] as const;
		for (const key of keys) {
			const baseline = await renderOffline(
				this.recording,
				this.params,
				this.bypass,
			);
			const singleBypass = await renderOffline(this.recording, this.params, {
				...this.bypass,
				[key]: true,
			});
			const a = baseline.buffer.getChannelData(0);
			const b = singleBypass.buffer.getChannelData(0);
			let maxDifference = 0;
			let sum = 0;
			for (let i = 0; i < a.length; i += 1) {
				const difference = Math.abs(a[i] - b[i]);
				maxDifference = Math.max(maxDifference, difference);
				sum += difference;
			}
			result[key] = {
				differ: maxDifference > 1e-6,
				maxDifference,
				meanDifference: sum / a.length,
			};
		}
		return result;
	}

	private sourceFacts() {
		if (!this.recording) {
			throw new Error("Recording not synthesized yet.");
		}
		return {
			duration: this.recording.duration,
			length: this.recording.length,
			sampleRate: this.recording.sampleRate,
			numberOfChannels: this.recording.numberOfChannels,
		};
	}

	private liveClips(): ClipCounters {
		return this.readClipCounters();
	}

	private async setPlaying(playing: boolean): Promise<void> {
		if (playing) {
			await this.play();
		} else {
			this.stop();
		}
	}

	private buildApi(): RestorationLabApi {
		return {
			ready: this.recording !== null,
			exportWav: () => this.exportWav(),
			compareEachBypass: () => this.compareEachBypass(),
			compareBypass: () => this.compareBypass(),
			sourceFacts: () => this.sourceFacts(),
			liveClips: () => this.liveClips(),
			setPlaying: (playing) => this.setPlaying(playing),
			isPlaying: () => this.isPlaying(),
		};
	}

	/**
	 * Stops playback and disconnects the example-owned graph on unmount.
	 * Deliberately does NOT destroy the melonJS `Application`: the example
	 * host re-parents the same canvas when this example remounts, matching
	 * every other example in the site.
	 */
	dispose(): void {
		this.stop();
		this.chain?.dispose();
		this.chain = null;
		window.__restorationLab = undefined;
		this.recording = null;
	}
}

/** shared singleton the React component talks to */
export const lab = new RestorationLab();
