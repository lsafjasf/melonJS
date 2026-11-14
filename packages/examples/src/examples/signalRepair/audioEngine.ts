import { audio } from "melonjs";
import {
	type LaneTarget,
	MODULE_ORDER,
	type ModuleKind,
	type NodeId,
	pathFromSource,
	type RepairModel,
} from "./model";

type ProcessorNode = BiquadFilterNode | DelayNode | GainNode;

interface LaneAudio {
	sourceGain: GainNode;
	sourceAnalyser: AnalyserNode;
	silentSink: GainNode;
	processors: Record<ModuleKind, ProcessorNode>;
	out: GainNode;
	source: AudioBufferSourceNode;
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

function clampSample(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

function makeRumbleBuffer(
	ctx: AudioContext,
	random: () => number,
): AudioBuffer {
	const seconds = 4;
	const rate = ctx.sampleRate;
	const buffer = ctx.createBuffer(1, rate * seconds, rate);
	const data = buffer.getChannelData(0);
	let brown = 0;
	for (let i = 0; i < data.length; i++) {
		const t = i / rate;
		const white = random() * 2 - 1;
		brown = (brown + white * 0.025) / 1.025;
		const hum =
			Math.sin(Math.PI * 2 * 47 * t) * 0.18 +
			Math.sin(Math.PI * 2 * 71 * t) * 0.08;
		const edge = Math.min(1, t / 0.08, (seconds - t) / 0.08);
		data[i] = clampSample((brown * 3.2 + hum) * edge * 0.56);
	}
	return buffer;
}

function makeEchoBuffer(ctx: AudioContext, random: () => number): AudioBuffer {
	const seconds = 2;
	const rate = ctx.sampleRate;
	const buffer = ctx.createBuffer(1, rate * seconds, rate);
	const data = buffer.getChannelData(0);
	const pulse = 0.5;
	for (let i = 0; i < data.length; i++) {
		const t = i / rate;
		const since = ((t % pulse) + pulse) % pulse;
		let sample = 0;
		for (let repeat = 0; repeat < 4; repeat++) {
			const local = since - repeat * 0.105;
			if (local < 0) continue;
			const env = Math.exp(-local * 20);
			sample +=
				Math.sin(Math.PI * 2 * (420 + repeat * 75) * local) * env * 0.22;
		}
		const drift = Math.sin(Math.PI * 2 * 0.5 * t) * 0.008;
		data[i] = clampSample(sample + drift * (random() - 0.5));
	}
	return buffer;
}

function makeSquealBuffer(
	ctx: AudioContext,
	random: () => number,
): AudioBuffer {
	const seconds = 2;
	const rate = ctx.sampleRate;
	const buffer = ctx.createBuffer(1, rate * seconds, rate);
	const data = buffer.getChannelData(0);
	const period = 0.72;
	for (let i = 0; i < data.length; i++) {
		const t = i / rate;
		const local = t % period;
		if (local > 0.16) {
			data[i] = (random() * 2 - 1) * 0.002;
			continue;
		}
		const env =
			Math.sin((Math.PI * local) / 0.16) ** 2 * Math.min(1, local / 0.008);
		const sweep = 2350 + local * 13_000;
		data[i] = clampSample(Math.sin(Math.PI * 2 * sweep * local) * env * 0.2);
	}
	return buffer;
}

function makeSourceBuffer(
	ctx: AudioContext,
	lane: number,
	seed: number,
): AudioBuffer {
	const random = seededRandom(seed ^ (lane * 0x9e3779b9));
	switch (lane) {
		case 0:
			return makeRumbleBuffer(ctx, random);
		case 1:
			return makeEchoBuffer(ctx, random);
		default:
			return makeSquealBuffer(ctx, random);
	}
}

function setParam(
	param: AudioParam,
	value: number,
	now: number,
	smooth = 0.015,
): void {
	param.cancelScheduledValues(now);
	param.setTargetAtTime(value, now, smooth);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export class SignalAudio {
	readonly available: boolean;
	private readonly ctx: AudioContext | null;
	private readonly mainSum: GainNode | null;
	private readonly mainGate: GainNode | null;
	private readonly feedbackGate: GainNode | null;
	private readonly compressor: DynamicsCompressorNode | null;
	private readonly analyser: AnalyserNode | null;
	private readonly waveData: Uint8Array<ArrayBuffer> | null;
	private readonly spectrumData: Uint8Array<ArrayBuffer> | null;
	private readonly lanes: LaneAudio[] = [];
	private readonly seed: number;
	private destroyed = false;

	constructor(model: RepairModel) {
		this.seed = model.seed;
		this.ctx = audio.getAudioContext();
		const master = audio.getMasterGain();
		if (!this.ctx || !master) {
			this.available = false;
			this.mainSum = null;
			this.mainGate = null;
			this.feedbackGate = null;
			this.compressor = null;
			this.analyser = null;
			this.waveData = null;
			this.spectrumData = null;
			return;
		}

		this.available = true;
		const ctx = this.ctx;
		this.mainSum = ctx.createGain();
		this.mainSum.gain.value = 0.74;
		this.mainGate = ctx.createGain();
		this.mainGate.gain.value = 1;
		this.feedbackGate = ctx.createGain();
		this.feedbackGate.gain.value = 1;
		this.compressor = ctx.createDynamicsCompressor();
		this.compressor.threshold.value = -20;
		this.compressor.knee.value = 8;
		this.compressor.ratio.value = 16;
		this.compressor.attack.value = 0.002;
		this.compressor.release.value = 0.22;
		this.analyser = ctx.createAnalyser();
		this.analyser.fftSize = 1024;
		this.analyser.smoothingTimeConstant = 0.66;
		this.waveData = new Uint8Array(this.analyser.fftSize);
		this.spectrumData = new Uint8Array(this.analyser.frequencyBinCount);

		this.mainSum.connect(this.mainGate);
		this.feedbackGate.connect(this.compressor);
		this.mainGate.connect(this.compressor);
		this.compressor.connect(this.analyser);
		this.analyser.connect(master);

		for (let lane = 0; lane < model.lanes.length; lane++) {
			this.lanes.push(this.createLane(lane));
		}
		this.applyModel(model);
	}

	private createLane(lane: number): LaneAudio {
		const ctx = this.ctx as AudioContext;
		const sourceGain = ctx.createGain();
		sourceGain.gain.value = [0.55, 0.5, 0.42][lane] ?? 0.45;
		const sourceAnalyser = ctx.createAnalyser();
		sourceAnalyser.fftSize = 256;
		sourceAnalyser.smoothingTimeConstant = 0.5;
		const silentSink = ctx.createGain();
		silentSink.gain.value = 0;
		sourceGain.connect(sourceAnalyser);
		sourceAnalyser.connect(silentSink);
		silentSink.connect(this.mainSum as GainNode);

		const source = ctx.createBufferSource();
		source.buffer = makeSourceBuffer(ctx, lane, this.seed);
		source.loop = true;
		source.connect(sourceGain);
		source.start();

		const hpf = ctx.createBiquadFilter();
		hpf.type = "highpass";
		hpf.Q.value = 0.72;
		const lpf = ctx.createBiquadFilter();
		lpf.type = "lowpass";
		lpf.Q.value = 0.72;
		const delay = ctx.createDelay(1);
		const gain = ctx.createGain();
		const out = ctx.createGain();
		out.gain.value = 1;
		out.connect(this.mainSum as GainNode);

		return {
			sourceGain,
			sourceAnalyser,
			silentSink,
			source,
			processors: { hpf, lpf, delay, gain },
			out,
		};
	}

	private applyModel(model: RepairModel): void {
		for (let lane = 0; lane < this.lanes.length; lane++) {
			this.setValues(lane, model.lanes[lane].values);
			const path = pathFromSource(model.lanes[lane].edges);
			this.setRoute(lane, path);
		}
	}

	private setValues(lane: number, values: LaneTarget): void {
		const ctx = this.ctx;
		const laneAudio = this.lanes[lane];
		if (!ctx || !laneAudio) return;
		const now = ctx.currentTime;
		const hpf = laneAudio.processors.hpf as BiquadFilterNode;
		const lpf = laneAudio.processors.lpf as BiquadFilterNode;
		const delay = laneAudio.processors.delay as DelayNode;
		const gain = laneAudio.processors.gain as GainNode;
		setParam(hpf.frequency, values.hpf, now);
		setParam(lpf.frequency, values.lpf, now);
		setParam(delay.delayTime, values.delay, now, 0.03);
		setParam(gain.gain, values.gain, now);
	}

	setKnob(lane: number, kind: ModuleKind, value: number): void {
		const ctx = this.ctx;
		const laneAudio = this.lanes[lane];
		if (!ctx || !laneAudio) return;
		const now = ctx.currentTime;
		switch (kind) {
			case "hpf":
				setParam(
					(laneAudio.processors.hpf as BiquadFilterNode).frequency,
					value,
					now,
				);
				break;
			case "lpf":
				setParam(
					(laneAudio.processors.lpf as BiquadFilterNode).frequency,
					value,
					now,
				);
				break;
			case "delay":
				setParam(
					(laneAudio.processors.delay as DelayNode).delayTime,
					value,
					now,
					0.03,
				);
				break;
			case "gain":
				setParam((laneAudio.processors.gain as GainNode).gain, value, now);
				break;
		}
	}

	setRoute(lane: number, path: readonly NodeId[]): void {
		const laneAudio = this.lanes[lane];
		if (!laneAudio) return;
		laneAudio.sourceGain.disconnect();
		for (const kind of MODULE_ORDER) {
			laneAudio.processors[kind].disconnect();
		}
		laneAudio.out.disconnect();
		laneAudio.sourceGain.connect(laneAudio.sourceAnalyser);
		laneAudio.sourceAnalyser.connect(laneAudio.silentSink);
		laneAudio.silentSink.connect(this.mainSum as GainNode);
		laneAudio.out.connect(this.mainSum as GainNode);

		let previous: AudioNode = laneAudio.sourceGain;
		for (const node of path) {
			if (node === "src") continue;
			if (node === "out") {
				previous.connect(laneAudio.out);
				break;
			}
			previous.connect(laneAudio.processors[node]);
			previous = laneAudio.processors[node];
		}
	}

	updateRoute(lane: number, path: readonly NodeId[]): void {
		this.setRoute(lane, path);
	}

	async resume(): Promise<void> {
		if (this.ctx?.state === "suspended") {
			await this.ctx.resume().catch(() => undefined);
		}
	}

	setProtection(active: boolean): void {
		const ctx = this.ctx;
		const gate = this.mainGate;
		if (!ctx || !gate) return;
		setParam(gate.gain, active ? 0 : 1, ctx.currentTime, 0.015);
	}

	shutdown(): void {
		const ctx = this.ctx;
		const gate = this.mainGate;
		if (!ctx || !gate) return;
		setParam(gate.gain, 0, ctx.currentTime, 0.03);
	}

	triggerFeedback(): void {
		const ctx = this.ctx;
		const feedbackGate = this.feedbackGate;
		if (!ctx || !feedbackGate) return;
		const now = ctx.currentTime;
		const oscillator = ctx.createOscillator();
		const shaper = ctx.createWaveShaper();
		const gain = ctx.createGain();
		const curve = new Float32Array(512);
		for (let i = 0; i < curve.length; i++) {
			const x = (i / (curve.length - 1)) * 2 - 1;
			curve[i] = Math.tanh(x * 3.2);
		}
		shaper.curve = curve;
		oscillator.type = "sawtooth";
		oscillator.frequency.setValueAtTime(420, now);
		oscillator.frequency.exponentialRampToValueAtTime(1_850, now + 0.22);
		oscillator.frequency.exponentialRampToValueAtTime(620, now + 0.62);
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
		gain.gain.setValueAtTime(0.22, now + 0.48);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
		oscillator.connect(shaper);
		shaper.connect(gain);
		gain.connect(feedbackGate);
		oscillator.start(now);
		oscillator.stop(now + 0.76);
		oscillator.addEventListener("ended", () => {
			oscillator.disconnect();
			shaper.disconnect();
			gain.disconnect();
		});
	}

	getMasterLevel(): number {
		const analyser = this.analyser;
		const data = this.waveData;
		if (!analyser || !data) return 0;
		analyser.getByteTimeDomainData(data);
		let sum = 0;
		for (let i = 0; i < data.length; i++) {
			const value = (data[i] - 128) / 128;
			sum += value * value;
		}
		const rms = Math.sqrt(sum / data.length);
		return clamp(rms * 4.2, 0, 1);
	}

	getMasterWaveform(): Uint8Array<ArrayBuffer> | null {
		if (!this.analyser || !this.waveData) return null;
		this.analyser.getByteTimeDomainData(this.waveData);
		return this.waveData;
	}

	getMasterSpectrum(): Uint8Array<ArrayBuffer> | null {
		if (!this.analyser || !this.spectrumData) return null;
		this.analyser.getByteFrequencyData(this.spectrumData);
		return this.spectrumData;
	}

	getSourceWaveform(lane: number): Uint8Array<ArrayBuffer> | null {
		const laneAudio = this.lanes[lane];
		if (!laneAudio) return null;
		const data = new Uint8Array(laneAudio.sourceAnalyser.fftSize);
		laneAudio.sourceAnalyser.getByteTimeDomainData(data);
		return data;
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		for (const lane of this.lanes) {
			try {
				lane.source.stop();
			} catch {
				// already stopped
			}
			lane.source.disconnect();
			lane.sourceGain.disconnect();
			lane.sourceAnalyser.disconnect();
			lane.silentSink.disconnect();
			for (const kind of MODULE_ORDER) {
				lane.processors[kind].disconnect();
			}
			lane.out.disconnect();
		}
		this.mainSum?.disconnect();
		this.mainGate?.disconnect();
		this.feedbackGate?.disconnect();
		this.compressor?.disconnect();
		this.analyser?.disconnect();
	}
}
