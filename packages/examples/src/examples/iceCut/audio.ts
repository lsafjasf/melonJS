/**
 * melonJS — CRYO CUT two-operator ice mill example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { audio } from "melonjs";
import { MAX_CUTTER_SPEED, MAX_TEMP } from "./constants";
import type { GameStatus } from "./simulation";

const clamp = (value: number, lo: number, hi: number): number =>
	Math.max(lo, Math.min(hi, value));

export interface SoundSnapshot {
	available: boolean;
	active: boolean;
	oscillatorHz: number;
	filterHz: number;
	noiseGain: number;
	humGain: number;
}

/**
 * One long-lived WebAudio graph for the cutter. A filtered triangle wave is
 * the motor, filtered noise is the ice, and both are modulated every frame so
 * the sound follows temperature and cutter speed continuously instead of
 * firing one-shot samples.
 */
export class CutterAudio {
	private ctx: AudioContext | null = null;
	private panner: StereoPannerNode | null = null;
	private oscillator: OscillatorNode | null = null;
	private oscillatorFilter: BiquadFilterNode | null = null;
	private oscillatorGain: GainNode | null = null;
	private noise: AudioBufferSourceNode | null = null;
	private noiseFilter: BiquadFilterNode | null = null;
	private noiseGain: GainNode | null = null;
	private snapshot: SoundSnapshot = {
		available: false,
		active: false,
		oscillatorHz: 0,
		filterHz: 0,
		noiseGain: 0,
		humGain: 0,
	};

	start(): void {
		if (this.ctx !== null) {
			void this.ctx.resume().catch(() => {
				// The browser will retry on the next input gesture.
			});
			return;
		}
		const ctx = audio.getAudioContext();
		const master = audio.getMasterGain();
		if (ctx === null || master === null) {
			return;
		}
		this.ctx = ctx;
		this.panner = ctx.createStereoPanner();
		this.panner.pan.value = 0;
		this.panner.connect(master);

		this.oscillator = ctx.createOscillator();
		this.oscillator.type = "triangle";
		this.oscillator.frequency.value = 94;
		this.oscillatorFilter = ctx.createBiquadFilter();
		this.oscillatorFilter.type = "lowpass";
		this.oscillatorFilter.frequency.value = 520;
		this.oscillatorFilter.Q.value = 2.1;
		this.oscillatorGain = ctx.createGain();
		this.oscillatorGain.gain.value = 0;
		this.oscillator.connect(this.oscillatorFilter);
		this.oscillatorFilter.connect(this.oscillatorGain);
		this.oscillatorGain.connect(this.panner);
		this.oscillator.start();

		const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		const channel = noiseBuffer.getChannelData(0);
		for (let i = 0; i < channel.length; i++) {
			channel[i] = Math.random() * 2 - 1;
		}
		this.noise = ctx.createBufferSource();
		this.noise.buffer = noiseBuffer;
		this.noise.loop = true;
		this.noiseFilter = ctx.createBiquadFilter();
		this.noiseFilter.type = "bandpass";
		this.noiseFilter.frequency.value = 940;
		this.noiseFilter.Q.value = 0.72;
		this.noiseGain = ctx.createGain();
		this.noiseGain.gain.value = 0;
		this.noise.connect(this.noiseFilter);
		this.noiseFilter.connect(this.noiseGain);
		this.noiseGain.connect(this.panner);
		this.noise.start();

		void ctx.resume().catch(() => {
			// Autoplay policy: the engine unlocks on the first key press too.
		});
		this.snapshot.available = true;
	}

	update(
		temperature: number,
		speed: number,
		cutting: boolean,
		status: GameStatus,
		pan: number,
	): void {
		if (
			this.ctx === null ||
			this.oscillator === null ||
			this.oscillatorFilter === null ||
			this.oscillatorGain === null ||
			this.noiseFilter === null ||
			this.noiseGain === null ||
			this.panner === null
		) {
			return;
		}
		const now = this.ctx.currentTime;
		const tempNorm = clamp(temperature / MAX_TEMP, 0, 1);
		const speedNorm = clamp(speed / MAX_CUTTER_SPEED, 0, 1);
		const active = status === "running";
		const oscillatorHz = 76 + tempNorm * 142 + speedNorm * 84;
		const filterHz = 420 + tempNorm * 880 + speedNorm * 1500;
		const humGain = active
			? 0.007 + tempNorm * 0.013 + (cutting ? 0.012 : 0.002)
			: 0;
		const noiseGain = active
			? 0.0015 + speedNorm * 0.019 + tempNorm * 0.005
			: 0;
		const ramp = 0.055;
		this.oscillator.frequency.setTargetAtTime(oscillatorHz, now, ramp);
		this.oscillatorFilter.frequency.setTargetAtTime(filterHz, now, ramp);
		this.oscillatorGain.gain.setTargetAtTime(humGain, now, ramp);
		this.noiseFilter.frequency.setTargetAtTime(
			720 + speedNorm * 2100 + tempNorm * 540,
			now,
			ramp,
		);
		this.noiseGain.gain.setTargetAtTime(noiseGain, now, ramp);
		this.panner.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.72, now, 0.08);
		this.snapshot = {
			available: true,
			active,
			oscillatorHz,
			filterHz,
			noiseGain,
			humGain,
		};
	}

	getSnapshot(): SoundSnapshot {
		return this.snapshot;
	}

	dispose(): void {
		const mute = this.ctx;
		if (mute !== null) {
			const now = mute.currentTime;
			this.oscillatorGain?.gain.setTargetAtTime(0, now, 0.03);
			this.noiseGain?.gain.setTargetAtTime(0, now, 0.03);
		}
		try {
			this.oscillator?.stop();
		} catch {
			// Already stopped.
		}
		try {
			this.noise?.stop();
		} catch {
			// Already stopped.
		}
		this.oscillator?.disconnect();
		this.oscillatorFilter?.disconnect();
		this.oscillatorGain?.disconnect();
		this.noise?.disconnect();
		this.noiseFilter?.disconnect();
		this.noiseGain?.disconnect();
		this.panner?.disconnect();
		this.ctx = null;
		this.oscillator = null;
		this.oscillatorFilter = null;
		this.oscillatorGain = null;
		this.noise = null;
		this.noiseFilter = null;
		this.noiseGain = null;
		this.panner = null;
		this.snapshot = {
			available: false,
			active: false,
			oscillatorHz: 0,
			filterHz: 0,
			noiseGain: 0,
			humGain: 0,
		};
	}
}
