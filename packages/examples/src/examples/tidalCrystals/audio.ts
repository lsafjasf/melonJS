/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { LightMode } from "./palette";

const MODE_AUDIO: Record<
	LightMode,
	{ noise: number; cutoff: number; drone: number; shimmer: number }
> = {
	noon: { noise: 0.055, cutoff: 820, drone: 72, shimmer: 0.012 },
	dusk: { noise: 0.075, cutoff: 470, drone: 58, shimmer: 0.023 },
	night: { noise: 0.036, cutoff: 280, drone: 91, shimmer: 0.008 },
};

/**
 * A small generative ambience: filtered water noise plus two detuned drones.
 * Water speed opens the filter and lifts the noise bed; the light mode changes
 * the tuning and the amount of high shimmer. No audio files are involved.
 */
export class TideAudio {
	private context: AudioContext | null = null;
	private noiseGain: GainNode | null = null;
	private filter: BiquadFilterNode | null = null;
	private droneA: OscillatorNode | null = null;
	private droneB: OscillatorNode | null = null;
	private shimmerGain: GainNode | null = null;
	private paused = false;
	private mode: LightMode = "noon";

	get ready(): boolean {
		return this.context !== null;
	}

	get isSuspended(): boolean {
		return this.context?.state === "suspended";
	}

	async unlock(): Promise<void> {
		if (this.paused) {
			return;
		}
		if (!this.context) {
			this.createContext();
		}
		if (this.context?.state === "suspended") {
			await this.context.resume();
		}
	}

	private createContext() {
		const AudioContextClass =
			globalThis.AudioContext ??
			(
				globalThis as typeof globalThis & {
					webkitAudioContext?: typeof AudioContext;
				}
			).webkitAudioContext;
		if (!AudioContextClass) {
			return;
		}

		const context = new AudioContextClass();
		const master = context.createGain();
		master.gain.value = 0.0001;
		master.connect(context.destination);

		const filter = context.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = MODE_AUDIO[this.mode].cutoff;
		filter.Q.value = 0.6;

		const noiseGain = context.createGain();
		noiseGain.gain.value = MODE_AUDIO[this.mode].noise;
		filter.connect(noiseGain);
		noiseGain.connect(master);

		const buffer = context.createBuffer(
			1,
			context.sampleRate * 3,
			context.sampleRate,
		);
		const samples = buffer.getChannelData(0);
		let last = 0;
		for (let i = 0; i < samples.length; i++) {
			const white = Math.random() * 2 - 1;
			last = last * 0.84 + white * 0.16;
			samples[i] = last * 0.8 + white * 0.2;
		}
		const noise = context.createBufferSource();
		noise.buffer = buffer;
		noise.loop = true;
		noise.connect(filter);

		const droneA = context.createOscillator();
		const droneB = context.createOscillator();
		const droneGain = context.createGain();
		const droneFilter = context.createBiquadFilter();
		droneA.type = "sine";
		droneB.type = "triangle";
		droneA.frequency.value = MODE_AUDIO[this.mode].drone;
		droneB.frequency.value = MODE_AUDIO[this.mode].drone * 1.505;
		droneGain.gain.value = 0.044;
		droneFilter.type = "lowpass";
		droneFilter.frequency.value = 260;
		droneA.connect(droneFilter);
		droneB.connect(droneFilter);
		droneFilter.connect(droneGain);
		droneGain.connect(master);

		const shimmer = context.createOscillator();
		const shimmerGain = context.createGain();
		shimmer.type = "sine";
		shimmer.frequency.value = 1180;
		shimmerGain.gain.value = MODE_AUDIO[this.mode].shimmer;
		shimmer.connect(shimmerGain);
		shimmerGain.connect(master);

		const lfo = context.createOscillator();
		const lfoGain = context.createGain();
		lfo.frequency.value = 0.13;
		lfoGain.gain.value = 120;
		lfo.connect(lfoGain);
		lfoGain.connect(filter.frequency);

		noise.start();
		droneA.start();
		droneB.start();
		shimmer.start();
		lfo.start();
		master.gain.setTargetAtTime(0.24, context.currentTime, 1.4);

		this.context = context;
		this.noiseGain = noiseGain;
		this.filter = filter;
		this.droneA = droneA;
		this.droneB = droneB;
		this.shimmerGain = shimmerGain;
	}

	setParameters(waterSpeed: number, mode: LightMode) {
		this.mode = mode;
		if (!this.context) {
			return;
		}
		const profile = MODE_AUDIO[mode];
		const now = this.context.currentTime;
		const speed = Math.max(0, Math.min(1, waterSpeed));
		this.filter?.frequency.setTargetAtTime(
			profile.cutoff + speed * 620,
			now,
			0.35,
		);
		this.noiseGain?.gain.setTargetAtTime(
			profile.noise + speed * 0.055,
			now,
			0.5,
		);
		this.droneA?.frequency.setTargetAtTime(profile.drone + speed * 5, now, 0.8);
		this.droneB?.frequency.setTargetAtTime(
			(profile.drone + speed * 5) * 1.505,
			now,
			0.8,
		);
		this.shimmerGain?.gain.setTargetAtTime(
			profile.shimmer * (0.6 + speed * 0.7),
			now,
			0.9,
		);
	}

	async setPaused(paused: boolean): Promise<void> {
		this.paused = paused;
		if (!this.context) {
			return;
		}
		if (paused) {
			await this.context.suspend();
		} else {
			await this.context.resume();
		}
	}

	async dispose(): Promise<void> {
		this.paused = true;
		if (!this.context) {
			return;
		}
		try {
			await this.context.close();
		} catch {
			// The context may already be closed by a page teardown.
		}
		this.context = null;
	}
}
