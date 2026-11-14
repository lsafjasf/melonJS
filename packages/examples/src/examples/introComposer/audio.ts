/**
 * melonJS — procedural intro composer: the Web Audio score.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { DURATION, FPS } from "./model";

const BEAT = 0.75;
const CHIMES = [
	{ time: 3.85, note: 392.0, pan: -0.38, gain: 0.3 },
	{ time: 4.62, note: 523.25, pan: 0.32, gain: 0.25 },
	{ time: 5.36, note: 587.33, pan: -0.16, gain: 0.27 },
	{ time: 6.22, note: 659.25, pan: 0.48, gain: 0.22 },
	{ time: 7.08, note: 783.99, pan: -0.52, gain: 0.24 },
	{ time: 7.73, note: 987.77, pan: 0.12, gain: 0.2 },
	{ time: 8.54, note: 659.25, pan: -0.26, gain: 0.28 },
	{ time: 9.31, note: 880.0, pan: 0.42, gain: 0.23 },
	{ time: 10.08, note: 1046.5, pan: -0.4, gain: 0.22 },
	{ time: 10.75, note: 1174.66, pan: 0.1, gain: 0.24 },
	{ time: 11.42, note: 1567.98, pan: 0, gain: 0.26 },
];

const nearestFrame = (time: number): number => Math.round(time * FPS) / FPS;

export class ProceduralScore {
	private ctx: AudioContext | undefined;
	private output: GainNode | undefined;
	private active = new Set<AudioScheduledSourceNode>();
	private bus: GainNode | undefined;
	private startedAt = 0;
	private offset = 0;

	private ensureContext(): AudioContext {
		if (!this.ctx) {
			this.ctx = new AudioContext({ latencyHint: "interactive" });
			this.output = this.ctx.createGain();
			this.output.gain.value = 0.72;
			this.output.connect(this.ctx.destination);
		}
		return this.ctx;
	}

	/** A fresh destination whose stream can be attached to a MediaRecorder. */
	captureDestination(): MediaStreamAudioDestinationNode {
		const ctx = this.ensureContext();
		return ctx.createMediaStreamDestination();
	}

	get currentTime(): number {
		if (!this.ctx || !this.bus) {
			return this.offset;
		}
		return Math.min(
			DURATION,
			this.offset + (this.ctx.currentTime - this.startedAt),
		);
	}

	get isRunning(): boolean {
		return Boolean(this.ctx && this.bus);
	}

	start(offset: number, capture?: MediaStreamAudioDestinationNode): void {
		const ctx = this.ensureContext();
		void ctx.resume();
		this.stop();
		this.bus = ctx.createGain();
		this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
		this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.025);
		this.bus.connect(this.output as GainNode);
		if (capture) {
			this.bus.connect(capture);
		}
		this.offset = nearestFrame(offset);
		this.startedAt = ctx.currentTime;
		const bus = this.bus;

		this.scheduleDrone(bus, this.offset, ctx.currentTime);
		for (
			let beat = Math.ceil(this.offset / BEAT) * BEAT;
			beat < DURATION;
			beat += BEAT
		) {
			const delay = Math.max(0, beat - this.offset);
			this.schedulePulse(bus, ctx.currentTime + delay, beat);
		}
		for (const chime of CHIMES) {
			if (chime.time >= this.offset) {
				this.scheduleChime(
					bus,
					ctx.currentTime + chime.time - this.offset,
					chime.note,
					chime.gain,
					chime.pan,
				);
			}
		}
	}

	stop(): void {
		const ctx = this.ctx;
		const bus = this.bus;
		if (!ctx || !bus) {
			return;
		}
		const now = ctx.currentTime;
		bus.gain.cancelScheduledValues(now);
		bus.gain.setValueAtTime(bus.gain.value, now);
		bus.gain.linearRampToValueAtTime(0.0001, now + 0.018);
		for (const source of this.active) {
			try {
				source.stop(now + 0.025);
			} catch {
				// already ended; nothing to stop
			}
		}
		this.active.clear();
		this.bus = undefined;
		this.offset = this.currentTime;
		window.setTimeout(() => {
			bus.disconnect();
		}, 50);
	}

	private track(source: AudioScheduledSourceNode): void {
		this.active.add(source);
		source.onended = () => {
			this.active.delete(source);
			source.disconnect();
		};
	}

	private panner(bus: GainNode, pan: number): StereoPannerNode {
		const ctx = this.ensureContext();
		const node = ctx.createStereoPanner();
		node.pan.value = pan;
		node.connect(bus);
		return node;
	}

	private schedulePulse(bus: GainNode, at: number, beat: number): void {
		const ctx = this.ensureContext();
		const phase = Math.min(1, beat / DURATION);
		const amp = 0.31 * (1 - phase * 0.55);
		const osc = ctx.createOscillator();
		const sub = ctx.createOscillator();
		const filter = ctx.createBiquadFilter();
		const gain = ctx.createGain();
		const pan = this.panner(bus, Math.sin(beat * 0.37) * 0.22);
		filter.type = "lowpass";
		filter.frequency.setValueAtTime(230, at);
		filter.Q.value = 2.2;
		osc.type = "sine";
		osc.frequency.setValueAtTime(82, at);
		osc.frequency.exponentialRampToValueAtTime(45, at + 0.34);
		sub.type = "triangle";
		sub.frequency.setValueAtTime(41, at);
		sub.frequency.exponentialRampToValueAtTime(35, at + 0.55);
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(amp, at + 0.055);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.02);
		osc.connect(filter);
		sub.connect(filter);
		filter.connect(gain);
		gain.connect(pan);
		osc.start(at);
		sub.start(at);
		osc.stop(at + 1.08);
		sub.stop(at + 1.08);
		this.track(osc);
		this.track(sub);
	}

	private scheduleDrone(bus: GainNode, offset: number, at: number): void {
		const ctx = this.ensureContext();
		const remaining = Math.max(0.1, DURATION - offset);
		const gain = ctx.createGain();
		const filter = ctx.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 290;
		filter.Q.value = 0.8;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.linearRampToValueAtTime(0.075, at + Math.min(2.4, remaining));
		gain.gain.linearRampToValueAtTime(0.035, at + remaining);
		gain.connect(bus);
		filter.connect(gain);
		for (const [frequency, detune, level] of [
			[46.25, -7, 1],
			[69.3, 5, 0.55],
			[92.5, -3, 0.3],
		]) {
			const osc = ctx.createOscillator();
			const partial = ctx.createGain();
			osc.type = "triangle";
			osc.frequency.value = frequency;
			osc.detune.value = detune;
			partial.gain.value = level;
			osc.connect(partial).connect(filter);
			osc.start(at);
			osc.stop(at + remaining + 0.04);
			this.track(osc);
		}
	}

	private scheduleChime(
		bus: GainNode,
		at: number,
		note: number,
		amount: number,
		pan: number,
	): void {
		const ctx = this.ensureContext();
		const output = this.panner(bus, pan);
		const partials: [number, number][] = [
			[1, 1],
			[2.01, 0.34],
			[3.02, 0.18],
			[4.98, 0.075],
		];
		for (const [ratio, level] of partials) {
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.type = "sine";
			osc.frequency.value = note * ratio;
			const peak = amount * level;
			const tail = 0.58 + ratio * 0.13;
			gain.gain.setValueAtTime(0.0001, at);
			gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
			gain.gain.exponentialRampToValueAtTime(0.0001, at + tail);
			osc.connect(gain).connect(output);
			osc.start(at);
			osc.stop(at + tail + 0.02);
			this.track(osc);
		}
	}

	destroy(): void {
		this.stop();
		if (this.output) {
			this.output.disconnect();
			this.output = undefined;
		}
		if (this.ctx) {
			void this.ctx.close();
			this.ctx = undefined;
		}
	}
}
