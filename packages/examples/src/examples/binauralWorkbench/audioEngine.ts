/**
 * The Web Audio graph behind the binaural workbench.
 *
 * A self-contained graph built on a BaseAudioContext so the exact same
 * wiring runs live (AudioContext) and during offline WAV rendering
 * (OfflineAudioContext). No external audio is used anywhere: the source
 * is a layered, slowly modulated pair of oscillators, and the room
 * reverb is a ConvolverNode fed a procedurally generated impulse
 * response.
 *
 * Three output modes share one graph and are switched with gains:
 * - dry: direct path only, equal-power panned
 * - wet: convolution return only
 * - binaural: both paths, each with an interaural time-difference
 *   delay network plus level difference (the head shadow)
 */
import {
	computeSpatialCues,
	FRONT_FILTER_HZ,
	generateImpulseResponse,
	interauralTimeDifference,
	type StereoImpulseResponse,
} from "./acoustics";
import type {
	OutputMode,
	PlanPoint,
	RoomDimensions,
	SpatialCues,
	WallMaterial,
} from "./types";

const MODE_GAIN: Record<OutputMode, { dry: number; wet: number }> = {
	dry: { dry: 1, wet: 0 },
	wet: { dry: 0, wet: 1 },
	binaural: { dry: 0.85, wet: 0.45 },
};

const impulseToBuffer = (
	ctx: BaseAudioContext,
	ir: StereoImpulseResponse,
): AudioBuffer => {
	const buffer = ctx.createBuffer(2, ir.lengthSamples, ir.sampleRate);
	buffer.copyToChannel(ir.left, 0);
	buffer.copyToChannel(ir.right, 1);
	return buffer;
};

export class BinauralAudioEngine {
	private readonly ctx: BaseAudioContext;
	private readonly output: GainNode;
	private readonly sourceGain: GainNode;
	private readonly dryPanner: StereoPannerNode;
	private readonly wetPanner: StereoPannerNode;
	private readonly frontBackFilter: BiquadFilterNode;
	private readonly convolver: ConvolverNode;
	private readonly dryBus: GainNode;
	private readonly wetBus: GainNode;
	private readonly binauralSplitter: ChannelSplitterNode;
	private readonly merger: ChannelMergerNode;
	private readonly leftDelay: DelayNode;
	private readonly rightDelay: DelayNode;
	private readonly leftGain: GainNode;
	private readonly rightGain: GainNode;
	private readonly oscillators: OscillatorNode[] = [];
	private room: RoomDimensions;
	private material: WallMaterial;
	private mode: OutputMode = "binaural";

	constructor(
		ctx: BaseAudioContext,
		room: RoomDimensions,
		material: WallMaterial,
	) {
		this.ctx = ctx;
		this.room = room;
		this.material = material;

		// --- source: two detuned oscillators through a tremolo ---
		this.sourceGain = ctx.createGain();
		this.sourceGain.gain.value = 0.18;
		const tremolo = ctx.createGain();
		tremolo.gain.value = 0.6;
		const lfo = ctx.createOscillator();
		lfo.frequency.value = 0.18;
		const lfoDepth = ctx.createGain();
		lfoDepth.gain.value = 0.4;
		lfo.connect(lfoDepth).connect(tremolo.gain);

		const carrierA = ctx.createOscillator();
		carrierA.type = "triangle";
		carrierA.frequency.value = 330;
		const carrierB = ctx.createOscillator();
		carrierB.type = "sine";
		carrierB.frequency.value = 495;
		const vibrato = ctx.createOscillator();
		vibrato.frequency.value = 0.09;
		const vibratoDepth = ctx.createGain();
		vibratoDepth.gain.value = 6;
		vibrato.connect(vibratoDepth).connect(carrierA.frequency);
		carrierA.connect(tremolo);
		carrierB.connect(tremolo);
		tremolo.connect(this.sourceGain);
		this.oscillators.push(carrierA, carrierB, lfo, vibrato);

		// --- shared front/back low-pass and distance gain ---
		this.frontBackFilter = ctx.createBiquadFilter();
		this.frontBackFilter.type = "lowpass";
		this.frontBackFilter.frequency.value = FRONT_FILTER_HZ;
		this.frontBackFilter.Q.value = 0.5;
		this.sourceGain.connect(this.frontBackFilter);

		// --- dry path ---
		this.dryPanner = ctx.createStereoPanner();
		this.dryBus = ctx.createGain();
		this.frontBackFilter.connect(this.dryPanner).connect(this.dryBus);

		// --- wet path: procedural impulse response convolution ---
		this.wetPanner = ctx.createStereoPanner();
		this.convolver = ctx.createConvolver();
		this.wetBus = ctx.createGain();
		this.frontBackFilter
			.connect(this.wetPanner)
			.connect(this.convolver)
			.connect(this.wetBus);

		// --- binaural interaural network on the mixed buses ---
		this.binauralSplitter = ctx.createChannelSplitter(2);
		this.merger = ctx.createChannelMerger(2);
		this.leftDelay = ctx.createDelay(0.002);
		this.rightDelay = ctx.createDelay(0.002);
		this.leftGain = ctx.createGain();
		this.rightGain = ctx.createGain();
		this.dryBus.connect(this.binauralSplitter);
		this.wetBus.connect(this.binauralSplitter);
		this.binauralSplitter.connect(this.leftDelay, 0);
		this.binauralSplitter.connect(this.rightDelay, 1);
		this.leftDelay.connect(this.leftGain).connect(this.merger, 0, 0);
		this.rightDelay.connect(this.rightGain).connect(this.merger, 0, 1);

		this.output = ctx.createGain();
		this.merger.connect(this.output);
		this.applyModeGains();
	}

	/** start every oscillator (the synthetic signal) */
	start(): void {
		for (const oscillator of this.oscillators) {
			oscillator.start();
		}
	}

	/** stop and disconnect the whole graph */
	stop(): void {
		for (const oscillator of this.oscillators) {
			try {
				oscillator.stop();
			} catch {
				// already stopped, e.g. an OfflineAudioContext graph
			}
		}
		this.output.disconnect();
	}

	/** route the graph to a destination node (speakers or render input) */
	connect(node: AudioNode): void {
		this.output.connect(node);
	}

	get outputNode(): GainNode {
		return this.output;
	}

	/**
	 * Regenerate the convolver's impulse response from the current room,
	 * material and source/listener geometry. Called once at build time
	 * and again whenever the room configuration changes.
	 */
	regenerateImpulseResponse(
		source: PlanPoint,
		listener: PlanPoint,
		heading = 0,
	): StereoImpulseResponse {
		const ir = generateImpulseResponse(
			this.ctx.sampleRate,
			this.room,
			this.material,
			source,
			listener,
			heading,
		);
		this.convolver.buffer = impulseToBuffer(this.ctx, ir);
		return ir;
	}

	setRoom(room: RoomDimensions, material: WallMaterial): void {
		this.room = room;
		this.material = material;
	}

	setMode(mode: OutputMode): void {
		this.mode = mode;
		this.applyModeGains();
	}

	private applyModeGains(): void {
		const { dry, wet } = MODE_GAIN[this.mode];
		const now = this.ctx.currentTime;
		this.dryBus.gain.setTargetAtTime(dry, now, 0.03);
		this.wetBus.gain.setTargetAtTime(wet, now, 0.03);
	}

	/**
	 * Apply the localisation cues for one frame. Pan, distance gain,
	 * the front/back low-pass and the binaural ITD/ILD all derive from
	 * the single {@link SpatialCues} object, so they stay in sync.
	 */
	updateSpatial(state: {
		source: PlanPoint;
		listener: PlanPoint;
		listenerHeading: number;
	}): SpatialCues {
		const cues = computeSpatialCues(state);
		const now = this.ctx.currentTime;

		this.dryPanner.pan.setTargetAtTime(cues.pan, now, 0.02);
		this.wetPanner.pan.setTargetAtTime(cues.pan * 0.6, now, 0.02);
		this.sourceGain.gain.setTargetAtTime(0.18 * cues.distanceGain, now, 0.02);
		this.frontBackFilter.frequency.setTargetAtTime(
			cues.frontBackFilterHz,
			now,
			0.05,
		);

		// ITD: delay the contralateral ear; ILD: shadow it slightly.
		const itd = interauralTimeDifference(cues.azimuth);
		this.leftDelay.delayTime.setTargetAtTime(Math.max(0, -itd), now, 0.02);
		this.rightDelay.delayTime.setTargetAtTime(Math.max(0, itd), now, 0.02);
		const shadow = Math.abs(cues.pan) * 0.12;
		this.leftGain.gain.setTargetAtTime(
			1 - Math.max(0, cues.pan) * 0.12 - shadow * 0.25,
			now,
			0.02,
		);
		this.rightGain.gain.setTargetAtTime(
			1 - Math.max(0, -cues.pan) * 0.12 - shadow * 0.25,
			now,
			0.02,
		);

		return cues;
	}

	/**
	 * Render a recorded listener trajectory to a stereo AudioBuffer,
	 * fully offline. Each entry is a timed {@link PlanPoint}; the source
	 * follows the same orbit used live.
	 */
	static async renderOffline(params: {
		room: RoomDimensions;
		material: WallMaterial;
		mode: OutputMode;
		durationSec: number;
		sampleRate: number;
		trajectory: ReadonlyArray<{ time: number; point: PlanPoint }>;
		sourceAt: (time: number) => PlanPoint;
		heading?: number;
	}): Promise<AudioBuffer> {
		const {
			room,
			material,
			mode,
			durationSec,
			sampleRate,
			trajectory,
			sourceAt,
			heading = 0,
		} = params;
		const frames = Math.ceil(durationSec * sampleRate);
		const offline = new OfflineAudioContext(2, frames, sampleRate);
		const engine = new BinauralAudioEngine(offline, room, material);
		engine.setMode(mode);
		const first = trajectory[0]?.point ?? {
			x: room.width / 2,
			y: room.depth / 2,
		};
		engine.regenerateImpulseResponse(sourceAt(0), first, heading);
		engine.connect(offline.destination);
		engine.start();

		// Schedule every sampled trajectory point with sample-accurate
		// timing; linear segments keep the path identical to the live one.
		for (let i = 0; i < trajectory.length; i += 1) {
			const sample = trajectory[i];
			const next = trajectory[i + 1] ?? sample;
			const span = Math.max(0.001, next.time - sample.time);
			const steps = Math.max(1, Math.ceil(span * 20));
			for (let step = 0; step < steps; step += 1) {
				const t = sample.time + (span * step) / steps;
				const mix = step / steps;
				const point = {
					x: sample.point.x + (next.point.x - sample.point.x) * mix,
					y: sample.point.y + (next.point.y - sample.point.y) * mix,
				};
				engine.updateSpatialAt(t, point, sourceAt(t), heading);
			}
		}

		const rendered = await offline.startRendering();
		engine.stop();
		return rendered;
	}

	/**
	 * Offline variant of {@link updateSpatial} that schedules against an
	 * explicit time instead of the running context clock.
	 */
	private updateSpatialAt(
		time: number,
		listener: PlanPoint,
		source: PlanPoint,
		heading: number,
	): void {
		const cues = computeSpatialCues({
			source,
			listener,
			listenerHeading: heading,
		});
		this.dryPanner.pan.setValueAtTime(cues.pan, time);
		this.wetPanner.pan.setValueAtTime(cues.pan * 0.6, time);
		this.sourceGain.gain.setValueAtTime(0.18 * cues.distanceGain, time);
		this.frontBackFilter.frequency.setValueAtTime(cues.frontBackFilterHz, time);
		const itd = interauralTimeDifference(cues.azimuth);
		this.leftDelay.delayTime.setValueAtTime(Math.max(0, -itd), time);
		this.rightDelay.delayTime.setValueAtTime(Math.max(0, itd), time);
		const shadow = Math.abs(cues.pan) * 0.12;
		this.leftGain.gain.setValueAtTime(
			1 - Math.max(0, cues.pan) * 0.12 - shadow * 0.25,
			time,
		);
		this.rightGain.gain.setValueAtTime(
			1 - Math.max(0, -cues.pan) * 0.12 - shadow * 0.25,
			time,
		);
	}
}
