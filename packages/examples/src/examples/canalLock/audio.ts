import { audio } from "melonjs";
import type { LockSnapshot, SimCue } from "./simulation";

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export class LockAudio {
	private context: AudioContext | null = null;
	private master: GainNode | null = null;
	private waterGain: GainNode | null = null;
	private waterFilter: BiquadFilterNode | null = null;
	private stressGain: GainNode | null = null;
	private stressOscillator: OscillatorNode | null = null;
	private pumpGain: GainNode | null = null;
	private pumpOscillator: OscillatorNode | null = null;
	private sources: AudioScheduledSourceNode[] = [];
	private disposed = false;

	constructor() {
		this.context = audio.getAudioContext();
		this.master = audio.getMasterGain();
		if (!this.context || !this.master) {
			return;
		}
		this.buildBed();
	}

	update(snapshot: LockSnapshot) {
		if (
			!this.context ||
			!this.waterGain ||
			!this.waterFilter ||
			!this.stressGain ||
			!this.stressOscillator ||
			!this.pumpGain ||
			!this.pumpOscillator ||
			this.disposed
		) {
			return;
		}

		const now = this.context.currentTime;
		const head = Math.max(snapshot.upstreamHeadM, snapshot.downstreamHeadM);
		const headRatio = clamp(head / 9.2, 0, 1);
		const gateFlow =
			Math.max(snapshot.gate1Open, snapshot.gate2Open) * headRatio;
		const pumping =
			snapshot.gate1Open < 0.02 && snapshot.gate2Open < 0.02
				? snapshot.pump > 0
					? snapshot.pump === 2
						? 1
						: 0.38
					: 0
				: 0;
		const stress = clamp(
			headRatio * 0.72 +
				(100 - Math.min(snapshot.gate1Health, snapshot.gate2Health)) / 100 +
				snapshot.vortex * 0.28,
			0,
			1,
		);

		this.waterGain.gain.setTargetAtTime(
			0.014 + gateFlow * 0.1 + pumping * 0.032 + snapshot.vortex * 0.04,
			now,
			0.08,
		);
		this.waterFilter.frequency.setTargetAtTime(
			420 + gateFlow * 1900 + pumping * 320 + headRatio * 260,
			now,
			0.12,
		);
		this.stressGain.gain.setTargetAtTime(
			0.004 + stress * stress * 0.055,
			now,
			0.12,
		);
		this.stressOscillator.frequency.setTargetAtTime(
			43 + headRatio * 47 + snapshot.vortex * 22,
			now,
			0.16,
		);
		this.pumpGain.gain.setTargetAtTime(
			pumping * 0.024,
			now,
			snapshot.pump === 0 ? 0.22 : 0.06,
		);
		this.pumpOscillator.frequency.setTargetAtTime(
			snapshot.pump === 2 ? 68 : 42,
			now,
			0.08,
		);
	}

	play(cue: SimCue) {
		switch (cue.type) {
			case "gate-start":
				audio.tone({
					freq: 92 + cue.power * 54,
					duration: 0.46,
					wave: "sawtooth",
					gain: 0.025 + cue.power * 0.025,
					attack: 0.02,
					pitchSlide: 0.42,
				});
				audio.noise({
					type: "brown",
					duration: 0.32,
					gain: 0.03,
					attack: 0.015,
					filter: { type: "lowpass", frequency: 520 + cue.power * 420 },
				});
				break;
			case "gate-stop":
				audio.noise({
					type: "white",
					duration: 0.08,
					gain: 0.06 + cue.power * 0.08,
					attack: 0.001,
					filter: { type: "bandpass", frequency: 1100, Q: 2 },
				});
				audio.tone({
					freq: 74,
					duration: 0.2,
					wave: "sine",
					gain: 0.06 + cue.power * 0.08,
					pitchSlide: 0.4,
				});
				break;
			case "creak":
				audio.tone({
					freq: 120 + cue.power * 118,
					duration: 0.36,
					wave: "sawtooth",
					gain: 0.018 + cue.power * 0.036,
					attack: 0.012,
					pitchSlide: 0.3,
				});
				audio.noise({
					type: "pink",
					duration: 0.22,
					gain: 0.012 + cue.power * 0.026,
					filter: {
						type: "bandpass",
						frequency: 260 + cue.power * 900,
						Q: 3,
					},
				});
				break;
			case "pump":
				audio.tone({
					freq: cue.setting === 2 ? 96 : 58,
					duration: cue.setting === 0 ? 0.2 : 0.4,
					wave: "square",
					gain: cue.setting === 0 ? 0.025 : 0.045,
					attack: 0.015,
					pitchSlide: cue.setting === 2 ? 0.2 : 0.08,
				});
				break;
			case "warning":
				audio.tone({
					freq: 670,
					duration: 0.13,
					wave: "square",
					gain: 0.04,
					attack: 0.002,
				});
				audio.tone({
					freq: 540,
					duration: 0.17,
					wave: "square",
					gain: 0.032,
					delay: 0.12,
				});
				break;
			case "success":
				audio.tone({
					freq: 392,
					duration: 0.18,
					gain: 0.06,
					attack: 0.006,
				});
				audio.tone({
					freq: 587,
					duration: 0.22,
					gain: 0.06,
					delay: 0.13,
				});
				audio.tone({
					freq: [784, 1176],
					duration: 0.75,
					gain: 0.05,
					delay: 0.28,
				});
				break;
			case "failure":
				audio.noise({
					type: "brown",
					duration: 1.35,
					gain: 0.13,
					attack: 0.005,
					filter: { type: "lowpass", frequency: 760 },
					filterSweep: 0.24,
				});
				audio.tone({
					freq: 68,
					duration: 0.95,
					wave: "sawtooth",
					gain: 0.1,
					pitchSlide: 0.35,
				});
				break;
			case "fault-armed":
				audio.tone({
					freq: 330,
					duration: 0.13,
					wave: "triangle",
					gain: 0.04,
				});
				audio.tone({
					freq: 220,
					duration: 0.2,
					wave: "triangle",
					gain: 0.045,
					delay: 0.11,
				});
				break;
			case "reset":
				break;
		}
	}

	dispose() {
		this.disposed = true;
		for (const source of this.sources) {
			try {
				source.stop();
			} catch {
				// a source that already ended cannot be stopped again
			}
		}
		this.sources.forEach((source) => {
			source.disconnect();
		});
		this.waterGain?.disconnect();
		this.waterFilter?.disconnect();
		this.stressGain?.disconnect();
		this.pumpGain?.disconnect();
	}

	private buildBed() {
		const context = this.context;
		const master = this.master;
		if (!context || !master) {
			return;
		}

		const twoSeconds = context.sampleRate * 2;
		const buffer = context.createBuffer(1, twoSeconds, context.sampleRate);
		const data = buffer.getChannelData(0);
		let previous = 0;
		for (let index = 0; index < data.length; index++) {
			const white = Math.random() * 2 - 1;
			previous = previous * 0.96 + white * 0.04;
			data[index] = previous * 2.6 + white * 0.08;
		}

		const water = context.createBufferSource();
		water.buffer = buffer;
		water.loop = true;

		this.waterFilter = context.createBiquadFilter();
		this.waterFilter.type = "lowpass";
		this.waterFilter.frequency.value = 560;
		this.waterFilter.Q.value = 0.6;

		this.waterGain = context.createGain();
		this.waterGain.gain.value = 0.014;
		water.connect(this.waterFilter);
		this.waterFilter.connect(this.waterGain);
		this.waterGain.connect(master);

		this.stressOscillator = context.createOscillator();
		this.stressOscillator.type = "sawtooth";
		this.stressOscillator.frequency.value = 46;
		this.stressGain = context.createGain();
		this.stressGain.gain.value = 0.004;
		this.stressOscillator.connect(this.stressGain);
		this.stressGain.connect(master);

		this.pumpOscillator = context.createOscillator();
		this.pumpOscillator.type = "triangle";
		this.pumpOscillator.frequency.value = 42;
		this.pumpGain = context.createGain();
		this.pumpGain.gain.value = 0;
		this.pumpOscillator.connect(this.pumpGain);
		this.pumpGain.connect(master);

		water.start();
		this.stressOscillator.start();
		this.pumpOscillator.start();
		this.sources = [water, this.stressOscillator, this.pumpOscillator];
	}
}
