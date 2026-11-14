/**
 * melonJS — Web Audio bed and timeline cues.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */
import { audio } from "melonjs";

interface AmbientGraph {
	oscillatorA: OscillatorNode;
	oscillatorB: OscillatorNode;
	lfo: OscillatorNode;
	gain: GainNode;
	filter: BiquadFilterNode;
}

interface CueNode {
	oscillator: OscillatorNode;
	gain: GainNode;
}

export class TimelineAudio {
	private context: AudioContext | null = null;
	private destination: AudioNode | null = null;
	private ambient: AmbientGraph | null = null;
	private cues = new Set<CueNode>();
	private duration = 12;

	get ready(): boolean {
		return this.context !== null;
	}

	get state(): "ready" | "idle" {
		return this.context ? "ready" : "idle";
	}

	async unlock(): Promise<boolean> {
		const context = audio.getAudioContext();
		if (!context) {
			return false;
		}
		this.context = context;
		this.destination = audio.getMasterGain() ?? context.destination;
		if (context.state === "suspended") {
			try {
				await context.resume();
			} catch {
				return false;
			}
		}
		return true;
	}

	private ambientFrequency(time: number): number {
		const progress = Math.min(Math.max(time / this.duration, 0), 1);
		return 44 + progress * 15 + Math.sin(progress * Math.PI) * 4.5;
	}

	private createAmbient(time: number) {
		if (!this.context || !this.destination) {
			return;
		}
		const now = this.context.currentTime;
		const filter = this.context.createBiquadFilter();
		filter.type = "lowpass";
		filter.frequency.value = 185;
		filter.Q.value = 0.85;

		const gain = this.context.createGain();
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.042, now + 0.18);

		const oscillatorA = this.context.createOscillator();
		oscillatorA.type = "sine";
		oscillatorA.frequency.value = this.ambientFrequency(time);
		const oscillatorB = this.context.createOscillator();
		oscillatorB.type = "triangle";
		oscillatorB.frequency.value = this.ambientFrequency(time) * 1.5;

		const lfo = this.context.createOscillator();
		lfo.type = "sine";
		lfo.frequency.value = 0.075;
		const lfoDepth = this.context.createGain();
		lfoDepth.gain.value = 2.2;
		lfo.connect(lfoDepth);
		lfoDepth.connect(oscillatorA.frequency);

		oscillatorA.connect(filter);
		oscillatorB.connect(filter);
		filter.connect(gain);
		gain.connect(this.destination);
		oscillatorA.start(now);
		oscillatorB.start(now);
		lfo.start(now);

		this.ambient = {
			oscillatorA,
			oscillatorB,
			lfo,
			gain,
			filter,
		};
	}

	async play(time: number, duration: number): Promise<boolean> {
		this.duration = duration;
		const ready = await this.unlock();
		if (!ready) {
			return false;
		}
		this.stopCues();
		this.restartAmbient(time);
		return true;
	}

	pause() {
		this.stopAmbient();
		this.stopCues();
	}

	seek(time: number, duration: number, playing: boolean) {
		this.duration = duration;
		this.stopCues();
		if (playing && this.context) {
			this.restartAmbient(time);
		} else {
			this.stopAmbient();
		}
	}

	preview(time: number, duration: number, playing: boolean) {
		this.duration = duration;
		this.stopCues();
		if (!playing || !this.context) {
			this.stopAmbient();
			return;
		}
		if (!this.ambient) {
			this.restartAmbient(time);
			return;
		}
		const now = this.context.currentTime;
		const frequency = this.ambientFrequency(time);
		this.ambient.oscillatorA.frequency.setTargetAtTime(frequency, now, 0.025);
		this.ambient.oscillatorB.frequency.setTargetAtTime(
			frequency * 1.5,
			now,
			0.025,
		);
		this.ambient.filter.frequency.setTargetAtTime(
			165 + (time / Math.max(duration, 0.01)) * 70,
			now,
			0.03,
		);
	}

	cue(time: number) {
		if (!this.context || !this.destination) {
			return;
		}
		const swing = Math.sin((time / Math.max(this.duration, 1)) * Math.PI * 2);
		const root = 329.63 + swing * 12;
		this.createCue(root, 0, 0.18, 0.095);
		this.createCue(root * 1.5, 0.055, 0.3, 0.055);
	}

	private createCue(
		frequency: number,
		delay: number,
		duration: number,
		level: number,
	) {
		if (!this.context || !this.destination) {
			return;
		}
		const now = this.context.currentTime;
		const start = now + delay;
		const end = start + duration;
		const oscillator = this.context.createOscillator();
		oscillator.type = "sine";
		oscillator.frequency.setValueAtTime(frequency, start);
		const gain = this.context.createGain();
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(level, start + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, end);
		oscillator.connect(gain);
		gain.connect(this.destination);
		const node = { oscillator, gain };
		this.cues.add(node);
		oscillator.onended = () => {
			this.cues.delete(node);
			oscillator.disconnect();
			gain.disconnect();
		};
		oscillator.start(start);
		oscillator.stop(end + 0.02);
	}

	private restartAmbient(time: number) {
		this.stopAmbient();
		this.createAmbient(time);
	}

	private stopAmbient() {
		if (!this.ambient || !this.context) {
			this.ambient = null;
			return;
		}
		const now = this.context.currentTime;
		const graph = this.ambient;
		this.ambient = null;
		graph.gain.gain.cancelScheduledValues(now);
		graph.gain.gain.setTargetAtTime(0.0001, now, 0.012);
		graph.oscillatorA.stop(now + 0.045);
		graph.oscillatorB.stop(now + 0.045);
		graph.lfo.stop(now + 0.045);
		graph.oscillatorA.onended = () => {
			graph.oscillatorA.disconnect();
			graph.oscillatorB.disconnect();
			graph.lfo.disconnect();
			graph.filter.disconnect();
			graph.gain.disconnect();
		};
	}

	private stopCues() {
		if (!this.context) {
			this.cues.clear();
			return;
		}
		const now = this.context.currentTime;
		for (const node of this.cues) {
			node.gain.gain.cancelScheduledValues(now);
			node.gain.gain.setTargetAtTime(0.0001, now, 0.005);
			try {
				node.oscillator.stop(now + 0.02);
			} catch {
				// already stopped
			}
		}
		this.cues.clear();
	}

	destroy() {
		this.stopAmbient();
		this.stopCues();
		this.context = null;
		this.destination = null;
	}
}
