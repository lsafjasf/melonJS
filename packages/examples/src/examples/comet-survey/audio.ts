/**
 * melonJS — Comet Survey example: Web Audio synthesis.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * All sound is synthesized: the equatorial mount motor (two detuned
 * oscillators whose gain follows slew speed), the shutter (filtered
 * noise bursts) and the accept / reject / survey-complete cues.
 */
export class SurveyAudio {
	private ctx: AudioContext | null = null;
	private motorGain: GainNode | null = null;
	private motorOsc: OscillatorNode[] = [];

	/** Create/resume the context. Must be called from a user gesture. */
	ensure() {
		if (!this.ctx) {
			this.ctx = new AudioContext();
			const lowpass = this.ctx.createBiquadFilter();
			lowpass.type = "lowpass";
			lowpass.frequency.value = 320;
			this.motorGain = this.ctx.createGain();
			this.motorGain.gain.value = 0;
			for (const freq of [66, 132.7]) {
				const osc = this.ctx.createOscillator();
				osc.type = "sawtooth";
				osc.frequency.value = freq;
				osc.connect(lowpass);
				osc.start();
				this.motorOsc.push(osc);
			}
			lowpass.connect(this.motorGain);
			this.motorGain.connect(this.ctx.destination);
		}
		if (this.ctx.state === "suspended") {
			void this.ctx.resume();
		}
	}

	/** Mount motor loudness, 0 (idle) to 1 (full slew). */
	setMotor(level: number) {
		if (!this.ctx || !this.motorGain) {
			return;
		}
		const gain = Math.min(0.14, Math.max(0, level) * 0.14);
		this.motorGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08);
	}

	/** Shutter click: a short filtered noise burst. */
	shutter() {
		const ctx = this.ctx;
		if (!ctx) {
			return;
		}
		const length = Math.floor(ctx.sampleRate * 0.05);
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) {
			data[i] = (Math.random() * 2 - 1) * (1 - i / length);
		}
		const source = ctx.createBufferSource();
		source.buffer = buffer;
		const band = ctx.createBiquadFilter();
		band.type = "bandpass";
		band.frequency.value = 1900;
		band.Q.value = 1.2;
		const gain = ctx.createGain();
		gain.gain.value = 0.6;
		source.connect(band);
		band.connect(gain);
		gain.connect(ctx.destination);
		source.start();
	}

	private tone(
		freq: number,
		start: number,
		duration: number,
		type: OscillatorType,
		volume: number,
	) {
		const ctx = this.ctx;
		if (!ctx) {
			return;
		}
		const osc = ctx.createOscillator();
		osc.type = type;
		osc.frequency.value = freq;
		const gain = ctx.createGain();
		gain.gain.setValueAtTime(0, ctx.currentTime + start);
		gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + start + 0.02);
		gain.gain.exponentialRampToValueAtTime(
			0.001,
			ctx.currentTime + start + duration,
		);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start(ctx.currentTime + start);
		osc.stop(ctx.currentTime + start + duration + 0.05);
	}

	/** Plate accepted: soft two-note chime. */
	accept() {
		this.tone(660, 0, 0.25, "sine", 0.25);
		this.tone(990, 0.12, 0.35, "sine", 0.2);
	}

	/** Plate rejected: low buzz. */
	reject() {
		this.tone(138, 0, 0.4, "sawtooth", 0.18);
		this.tone(92, 0.05, 0.4, "sawtooth", 0.14);
	}

	/** Survey complete: rising arpeggio. */
	complete() {
		for (const [i, freq] of [523, 659, 784, 1046].entries()) {
			this.tone(freq, i * 0.13, 0.4, "triangle", 0.22);
		}
	}

	dispose() {
		for (const osc of this.motorOsc) {
			osc.stop();
		}
		this.motorOsc = [];
		void this.ctx?.close();
		this.ctx = null;
		this.motorGain = null;
	}
}
