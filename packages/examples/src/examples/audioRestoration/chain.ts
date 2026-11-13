/**
 * melonJS — audio restoration lab: the repair chain.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * One graph that works on both a live `AudioContext` and an
 * `OfflineAudioContext`:
 *
 * source → input meter → high-pass → low-pass → notch → gate
 *        → soft clip → output meter → destination
 *
 * Every repair node carries parallel wet/dry gains, so bypassing it is a
 * zero-reconnection gain switch and the graph stays identical between the
 * live preview and the offline WAV export.
 */

/** the parameters each repair node exposes to the UI */
export interface RepairParams {
	/** high-pass cutoff in Hz, cuts the low-end rumble */
	highpassFrequency: number;
	/** low-pass cutoff in Hz, rolls off hiss and crackle harmonics */
	lowpassFrequency: number;
	/** notch centre frequency in Hz, usually the 50 Hz mains hum */
	notchFrequency: number;
	/** notch depth as a Q value; higher Q means a narrower, deeper cut */
	notchQ: number;
	/** gate threshold in dB below which the gate closes */
	gateThreshold: number;
	/** soft-clip drive: 1 is gentle, higher values saturate harder */
	softClipDrive: number;
}

/** which nodes are currently bypassed */
export interface BypassState {
	highpass: boolean;
	lowpass: boolean;
	notch: boolean;
	gate: boolean;
	softClip: boolean;
}

/** the default repair settings: every node engaged, modest values */
export const DEFAULT_PARAMS: RepairParams = {
	highpassFrequency: 90,
	lowpassFrequency: 9000,
	notchFrequency: 50,
	notchQ: 8,
	gateThreshold: -45,
	softClipDrive: 1.4,
};

export const DEFAULT_BYPASS: BypassState = {
	highpass: false,
	lowpass: false,
	notch: false,
	gate: false,
	softClip: false,
};

/**
 * Builds the tanh soft-clipping curve for a `WaveShaperNode`. The drive
 * pre-scales the input, so higher drive pushes more of the signal into the
 * saturating region without hard-clipping it.
 */
const makeSoftClipCurve = (drive: number, samples = 1024): Float32Array => {
	const curve = new Float32Array(samples);
	for (let i = 0; i < samples; i += 1) {
		const x = (i * 2) / (samples - 1) - 1;
		curve[i] = Math.tanh(x * drive);
	}
	return curve;
};

const CLIP_THRESHOLD = 0.999;

/**
 * A clip-counting `AudioWorkletProcessor`: counts full-scale-ish samples
 * (|x| >= 0.999) seen on its input, passes the audio through untouched and
 * publishes the running total over its message port. Registered from a
 * blob URL, so the example needs no separate worklet asset file and the
 * same registration works on a live and an offline context.
 */
const clipCounterWorkletSource = `
class ClipCounterProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.total = 0;
	}
	process(inputs, outputs) {
		const input = inputs[0];
		const output = outputs[0];
		if (input && input.length > 0 && output && output.length > 0) {
			let clipped = 0;
			for (let channel = 0; channel < input.length; channel += 1) {
				output[channel].set(input[channel]);
				for (let i = 0; i < input[channel].length; i += 1) {
					if (
						Math.abs(input[channel][i]) >=
						${CLIP_THRESHOLD.toFixed(3)}
					) {
						clipped += 1;
					}
				}
			}
			if (clipped > 0) {
				this.total += clipped;
				// only message when the total moves: a ten-second offline
				// render would otherwise queue ~2800 messages per counter
				this.port.postMessage({ total: this.total });
			}
		}
		return true;
	}
}
registerProcessor("clip-counter", ClipCounterProcessor);
`;

let workletUrl: string | null = null;

/** registers the clip-counter worklet once per context, from a blob */
const ensureWorklet = async (context: BaseAudioContext): Promise<boolean> => {
	if (workletUrl === null) {
		const blob = new Blob([clipCounterWorkletSource], {
			type: "application/javascript",
		});
		workletUrl = URL.createObjectURL(blob);
	}
	try {
		await context.audioWorklet.addModule(workletUrl);
		return true;
	} catch {
		// audio worklets unavailable (older engine): the analyser fallback
		// in RestorationChain keeps a best-effort count instead
		return false;
	}
};

/** a single bypassable effect with parallel wet/dry paths */
interface BypassableNode {
	readonly input: GainNode;
	readonly output: GainNode;
	readonly wet: GainNode;
	readonly dry: GainNode;
}

const createBypassable = (
	context: BaseAudioContext,
	effect: AudioNode,
): BypassableNode => {
	const input = context.createGain();
	const output = context.createGain();
	const wet = context.createGain();
	const dry = context.createGain();
	input.connect(wet);
	wet.connect(effect);
	effect.connect(output);
	input.connect(dry);
	dry.connect(output);
	return { input, output, wet, dry };
};

const setBypassed = (stage: BypassableNode, bypassed: boolean) => {
	stage.wet.gain.value = bypassed ? 0 : 1;
	stage.dry.gain.value = bypassed ? 1 : 0;
};

export interface ClipCounters {
	/** clipped samples counted on the raw recording */
	input: number;
	/** clipped samples counted on the repaired output */
	output: number;
}

/**
 * The assembled repair graph for one context. Build it once, then drive
 * parameters live; for export, build a second instance on an
 * `OfflineAudioContext` with the same settings.
 */
export class RestorationChain {
	readonly input: GainNode;
	readonly output: GainNode;
	/** analyser taps for the before/after waveform and spectrum displays */
	readonly inputAnalyser: AnalyserNode;
	readonly outputAnalyser: AnalyserNode;

	private readonly context: BaseAudioContext;
	private readonly highpass: BiquadFilterNode;
	private readonly lowpass: BiquadFilterNode;
	private readonly notch: BiquadFilterNode;
	private readonly gate: DynamicsCompressorNode;
	private readonly softClip: WaveShaperNode;

	private readonly highpassStage: BypassableNode;
	private readonly lowpassStage: BypassableNode;
	private readonly notchStage: BypassableNode;
	private readonly gateStage: BypassableNode;
	private readonly softClipStage: BypassableNode;

	private inputCounter: AudioWorkletNode | null = null;
	private outputCounter: AudioWorkletNode | null = null;
	/** counts accumulated from worklet `port` messages (live + offline) */
	private inputClipCount = 0;
	private outputClipCount = 0;

	private constructor(context: BaseAudioContext) {
		this.context = context;
		this.input = context.createGain();
		this.output = context.createGain();

		this.inputAnalyser = context.createAnalyser();
		this.inputAnalyser.fftSize = 2048;
		this.outputAnalyser = context.createAnalyser();
		this.outputAnalyser.fftSize = 2048;

		this.highpass = context.createBiquadFilter();
		this.highpass.type = "highpass";

		this.lowpass = context.createBiquadFilter();
		this.lowpass.type = "lowpass";

		this.notch = context.createBiquadFilter();
		this.notch.type = "notch";

		// a hard-knee, deep-ratio compressor with fast attack acts as a
		// downward expander/gate once the threshold dips below the bed
		this.gate = context.createDynamicsCompressor();
		this.gate.knee.value = 0;
		this.gate.ratio.value = 20;
		this.gate.attack.value = 0.002;
		this.gate.release.value = 0.12;

		this.softClip = context.createWaveShaper();
		this.softClip.oversample = "4x";

		this.highpassStage = createBypassable(context, this.highpass);
		this.lowpassStage = createBypassable(context, this.lowpass);
		this.notchStage = createBypassable(context, this.notch);
		this.gateStage = createBypassable(context, this.gate);
		this.softClipStage = createBypassable(context, this.softClip);

		// source → [input counter] → input analyser → high-pass → low-pass
		// → notch → gate → soft clip → [output counter] → output analyser
		// → out. The counters are inserted in create() when worklets exist;
		// without them the analysers tap the chain points directly.
		this.input.connect(this.inputAnalyser);
		this.input.connect(this.highpassStage.input);
		this.highpassStage.output.connect(this.lowpassStage.input);
		this.lowpassStage.output.connect(this.notchStage.input);
		this.notchStage.output.connect(this.gateStage.input);
		this.gateStage.output.connect(this.softClipStage.input);
		this.softClipStage.output.connect(this.outputAnalyser);
		this.outputAnalyser.connect(this.output);
	}

	/**
	 * Builds the chain and, where `AudioWorklet` is available, wires two
	 * clip counters around it (one on the raw input, one on the output).
	 */
	static async create(context: BaseAudioContext): Promise<RestorationChain> {
		const chain = new RestorationChain(context);
		const workletsAvailable = await ensureWorklet(context);
		if (workletsAvailable) {
			chain.inputCounter = new AudioWorkletNode(context, "clip-counter");
			chain.outputCounter = new AudioWorkletNode(context, "clip-counter");
			chain.inputCounter.port.onmessage = (event: MessageEvent) => {
				chain.inputClipCount = (event.data as { total: number }).total;
			};
			chain.outputCounter.port.onmessage = (event: MessageEvent) => {
				chain.outputClipCount = (event.data as { total: number }).total;
			};
			// the worklets are passthrough nodes (process() leaves the
			// output block equal to its input), so insert them into the
			// main path: every sample is counted and audio still flows
			chain.input.disconnect(chain.inputAnalyser);
			chain.input.connect(chain.inputCounter);
			chain.inputCounter.connect(chain.inputAnalyser);
			chain.softClipStage.output.disconnect(chain.outputAnalyser);
			chain.softClipStage.output.connect(chain.outputCounter);
			chain.outputCounter.connect(chain.outputAnalyser);
		}
		chain.applyParams(DEFAULT_PARAMS);
		chain.applyBypass(DEFAULT_BYPASS);
		return chain;
	}

	/** pushes a full parameter set onto the live nodes, in real time */
	applyParams(params: RepairParams): void {
		const now = this.context.currentTime;
		this.highpass.frequency.setTargetAtTime(
			params.highpassFrequency,
			now,
			0.01,
		);
		this.lowpass.frequency.setTargetAtTime(params.lowpassFrequency, now, 0.01);
		this.notch.frequency.setTargetAtTime(params.notchFrequency, now, 0.01);
		this.notch.Q.setTargetAtTime(params.notchQ, now, 0.01);
		this.gate.threshold.setTargetAtTime(params.gateThreshold, now, 0.01);
		this.softClip.curve = makeSoftClipCurve(params.softClipDrive);
	}

	/** switches each node between its wet effect and the dry bypass path */
	applyBypass(bypass: BypassState): void {
		setBypassed(this.highpassStage, bypass.highpass);
		setBypassed(this.lowpassStage, bypass.lowpass);
		setBypassed(this.notchStage, bypass.notch);
		setBypassed(this.gateStage, bypass.gate);
		setBypassed(this.softClipStage, bypass.softClip);
	}

	/**
	 * Reads the accumulated clip counts. With worklets these are exact
	 * sample counts; without them the analyser fallback approximates from
	 * the most recent time-domain frame.
	 */
	readClipCounters(): ClipCounters {
		const read = (
			node: AudioWorkletNode | null,
			analyser: AnalyserNode,
			accumulated: number,
		) => {
			if (node) {
				return accumulated;
			}
			const frame = new Float32Array(analyser.fftSize);
			analyser.getFloatTimeDomainData(frame);
			let clipped = 0;
			for (const sample of frame) {
				if (Math.abs(sample) >= CLIP_THRESHOLD) {
					clipped += 1;
				}
			}
			return clipped;
		};
		return {
			input: read(this.inputCounter, this.inputAnalyser, this.inputClipCount),
			output: read(
				this.outputCounter,
				this.outputAnalyser,
				this.outputClipCount,
			),
		};
	}

	/** disconnects every node the chain created */
	dispose(): void {
		this.input.disconnect();
		this.highpassStage.input.disconnect();
		this.highpassStage.output.disconnect();
		this.lowpassStage.input.disconnect();
		this.lowpassStage.output.disconnect();
		this.notchStage.input.disconnect();
		this.notchStage.output.disconnect();
		this.gateStage.input.disconnect();
		this.gateStage.output.disconnect();
		this.softClipStage.input.disconnect();
		this.softClipStage.output.disconnect();
		this.inputAnalyser.disconnect();
		this.outputAnalyser.disconnect();
		this.inputCounter?.disconnect();
		this.outputCounter?.disconnect();
		this.output.disconnect();
	}
}
