/**
 * melonJS — Station Tapes example: seeded procedural case generation.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Every sound is synthesised on the spot through an OfflineAudioContext —
 * no audio files are loaded. All randomness flows from one seeded PRNG, so
 * the same seed always renders the same six recordings.
 */

export const CLIP_COUNT = 6;
export const CLIP_DURATION = 5; // seconds per recording
export const MARKER_TOLERANCE = 0.35; // seconds of slack when judging a marker
export const BUCKETS = 120; // waveform / sound-pressure display resolution

const SAMPLE_RATE = 22050;
const LABELS = ["A", "B", "C", "D", "E", "F"];
const PENTATONIC = [523.25, 587.33, 659.25, 698.46, 783.99, 880.0];

/** the clip (true chronological index) holding each key event */
const FOOTSTEPS_CLIP = 3; // the running footsteps
const DOOR_CLOSE_CLIP = 4; // the warning beeps + door slam

export interface KeyEventInfo {
	clipIndex: number;
	time: number; // seconds into the clip
}

/** one beat of the real event line, revealed when the case is closed */
export interface CaseEvent {
	clipIndex: number;
	time: number;
	label: string;
}

export interface ClipInfo {
	trueIndex: number;
	label: string;
	buffer: AudioBuffer;
	peaks: Float32Array; // waveform envelope, BUCKETS entries
	rms: Float32Array; // sound pressure, BUCKETS entries
	checksum: string;
}

export interface CaseFile {
	seed: number;
	clips: ClipInfo[]; // in TRUE chronological order
	presentation: number[]; // slot index -> true index (the shuffle shown to the player)
	events: CaseEvent[]; // the real event line, in true time
	answer: {
		footsteps: KeyEventInfo;
		doorClose: KeyEventInfo;
	};
}

/** deterministic PRNG — the single source of randomness for a case */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type Ctx = OfflineAudioContext;

function makeNoise(ctx: Ctx, rand: () => number, type: "white" | "brown", seconds: number): AudioBuffer {
	const length = Math.ceil(seconds * ctx.sampleRate);
	const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	let last = 0;
	for (let i = 0; i < length; i++) {
		const w = rand() * 2 - 1;
		if (type === "brown") {
			last = (last + 0.02 * w) / 1.02;
			data[i] = last * 3.5;
		} else {
			data[i] = w;
		}
	}
	return buffer;
}

interface ToneOptions {
	t: number;
	dur: number;
	freq: number;
	type?: OscillatorType;
	gain?: number;
	slideTo?: number;
}

function tone(ctx: Ctx, dest: AudioNode, o: ToneOptions): void {
	const osc = ctx.createOscillator();
	osc.type = o.type ?? "sine";
	osc.frequency.setValueAtTime(o.freq, o.t);
	if (o.slideTo !== undefined) {
		osc.frequency.exponentialRampToValueAtTime(o.slideTo, o.t + o.dur);
	}
	const g = ctx.createGain();
	g.gain.setValueAtTime(0, o.t);
	g.gain.linearRampToValueAtTime(o.gain ?? 0.2, o.t + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
	osc.connect(g);
	g.connect(dest);
	osc.start(o.t);
	osc.stop(o.t + o.dur + 0.05);
}

interface BurstOptions {
	t: number;
	dur: number;
	gain: number;
	type?: BiquadFilterType;
	freq?: number;
	q?: number;
	pan?: number;
}

function burst(ctx: Ctx, dest: AudioNode, noise: AudioBuffer, o: BurstOptions): void {
	const src = ctx.createBufferSource();
	src.buffer = noise;
	src.loop = true;
	const filter = ctx.createBiquadFilter();
	filter.type = o.type ?? "bandpass";
	filter.frequency.value = o.freq ?? 800;
	filter.Q.value = o.q ?? 1;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0, o.t);
	g.gain.linearRampToValueAtTime(o.gain, o.t + 0.008);
	g.gain.exponentialRampToValueAtTime(0.0001, o.t + o.dur);
	src.connect(filter);
	filter.connect(g);
	if (o.pan !== undefined && o.pan !== 0) {
		const panner = ctx.createStereoPanner();
		panner.pan.value = o.pan;
		g.connect(panner);
		panner.connect(dest);
	} else {
		g.connect(dest);
	}
	src.start(o.t);
	src.stop(o.t + o.dur + 0.05);
}

/**
 * Train-rumble loudness over the true timeline, as [time, gain] ramps per
 * clip: quiet platform, arrival, idle, dwell, departure spool, fading away.
 * The envelope is the second ordering cue after the chime count.
 */
const RUMBLE_ENV: [number, number][][] = [
	[[0, 0.02], [5, 0.03]],
	[[0, 0.06], [4, 0.5], [5, 0.55]],
	[[0, 0.5], [1, 0.15], [5, 0.12]],
	[[0, 0.12], [5, 0.14]],
	[[0, 0.14], [4.6, 0.16], [5, 0.35]],
	[[0, 0.4], [3, 0.1], [5, 0.03]],
];

async function renderClip(
	rand: () => number,
	trueIndex: number,
	keyTimes: { footsteps: number; doorClose: number },
	events: CaseEvent[],
): Promise<AudioBuffer> {
	const ctx = new OfflineAudioContext(1, SAMPLE_RATE * CLIP_DURATION, SAMPLE_RATE);
	const white = makeNoise(ctx, rand, "white", 2);
	const brown = makeNoise(ctx, rand, "brown", CLIP_DURATION + 1);
	const master = ctx.createGain();
	master.gain.value = 0.9;
	master.connect(ctx.destination);

	// synthesised ambience: a rumble bed under tape hiss
	const bedSrc = ctx.createBufferSource();
	bedSrc.buffer = brown;
	bedSrc.loop = true;
	const bedFilter = ctx.createBiquadFilter();
	bedFilter.type = "lowpass";
	bedFilter.frequency.value = 160 + trueIndex * 30;
	const bedGain = ctx.createGain();
	const env = RUMBLE_ENV[trueIndex];
	bedGain.gain.setValueAtTime(env[0][1], 0);
	for (const [t, v] of env) {
		bedGain.gain.linearRampToValueAtTime(v, t);
	}
	bedSrc.connect(bedFilter);
	bedFilter.connect(bedGain);
	bedGain.connect(master);
	bedSrc.start(0);

	const hissSrc = ctx.createBufferSource();
	hissSrc.buffer = white;
	hissSrc.loop = true;
	const hissFilter = ctx.createBiquadFilter();
	hissFilter.type = "highpass";
	hissFilter.frequency.value = 4000;
	const hissGain = ctx.createGain();
	hissGain.gain.value = 0.012;
	hissSrc.connect(hissFilter);
	hissFilter.connect(hissGain);
	hissGain.connect(master);
	hissSrc.start(0);

	// brake screech as the train comes in
	if (trueIndex === 1) {
		const tScreech = 3.4 + rand() * 0.6;
		tone(ctx, master, { t: tScreech, dur: 1.2, freq: 2600, slideTo: 1700, gain: 0.05 });
		events.push({ clipIndex: trueIndex, time: tScreech, label: "刹车" });
	}

	// announcement: a chime of (trueIndex + 1) notes, then muffled speech
	const tAnn = 0.5 + rand() * 0.5;
	events.push({ clipIndex: trueIndex, time: tAnn, label: `广播${trueIndex + 1}声` });
	for (let n = 0; n <= trueIndex; n++) {
		tone(ctx, master, {
			t: tAnn + n * 0.24,
			dur: 0.2,
			freq: PENTATONIC[(n + trueIndex) % PENTATONIC.length],
			gain: 0.14,
		});
	}
	let tMurmur = tAnn + (trueIndex + 1) * 0.24 + 0.25;
	const syllables = 4 + Math.floor(rand() * 4);
	for (let s = 0; s < syllables; s++) {
		burst(ctx, master, white, {
			t: tMurmur,
			dur: 0.07 + rand() * 0.1,
			gain: 0.05,
			freq: 600 + rand() * 800,
			q: 3,
		});
		tMurmur += 0.12 + rand() * 0.14;
	}

	// footsteps: a running burst in the key clip, a few walking steps elsewhere
	if (trueIndex === FOOTSTEPS_CLIP) {
		const t0 = keyTimes.footsteps;
		events.push({ clipIndex: trueIndex, time: t0, label: "急促脚步" });
		const steps = 8 + Math.floor(rand() * 3);
		for (let s = 0; s < steps; s++) {
			burst(ctx, master, white, {
				t: t0 + s * (0.16 + rand() * 0.03),
				dur: 0.08,
				gain: 0.4,
				freq: 260,
				q: 1.1,
				pan: s % 2 === 0 ? -0.35 : 0.35,
			});
		}
	} else {
		const steps = 2 + Math.floor(rand() * 3);
		const t0 = 0.8 + rand() * 2.8;
		for (let s = 0; s < steps; s++) {
			burst(ctx, master, white, {
				t: t0 + s * (0.5 + rand() * 0.12),
				dur: 0.07,
				gain: 0.16,
				freq: 380,
				q: 1.2,
				pan: s % 2 === 0 ? -0.2 : 0.2,
			});
		}
	}

	// doors: warning beeps + slam in the key clip, a distant thud elsewhere
	if (trueIndex === DOOR_CLOSE_CLIP) {
		const tSlam = keyTimes.doorClose;
		events.push({ clipIndex: trueIndex, time: tSlam, label: "关门" });
		for (let b = 0; b < 3; b++) {
			tone(ctx, master, { t: tSlam - 0.95 + b * 0.28, dur: 0.12, freq: 880, type: "square", gain: 0.08 });
		}
		burst(ctx, master, white, { t: tSlam, dur: 0.28, gain: 0.5, type: "lowpass", freq: 420 });
		tone(ctx, master, { t: tSlam, dur: 0.3, freq: 58, gain: 0.5 });
	} else {
		const t = 0.9 + rand() * 3.4;
		tone(ctx, master, { t, dur: 0.16, freq: 70, gain: 0.12 });
		burst(ctx, master, white, { t, dur: 0.05, gain: 0.08, type: "lowpass", freq: 900 });
	}

	return ctx.startRendering();
}

function analyse(buffer: AudioBuffer): { peaks: Float32Array; rms: Float32Array } {
	const data = buffer.getChannelData(0);
	const peaks = new Float32Array(BUCKETS);
	const rms = new Float32Array(BUCKETS);
	const perBucket = Math.floor(data.length / BUCKETS);
	for (let b = 0; b < BUCKETS; b++) {
		let peak = 0;
		let sum = 0;
		const start = b * perBucket;
		for (let i = 0; i < perBucket; i++) {
			const v = Math.abs(data[start + i]);
			if (v > peak) {
				peak = v;
			}
			sum += v * v;
		}
		peaks[b] = peak;
		rms[b] = Math.sqrt(sum / perBucket);
	}
	return { peaks, rms };
}

/** a stable fingerprint of the rendered samples, for seed-determinism checks */
function checksum(buffer: AudioBuffer): string {
	const data = buffer.getChannelData(0);
	let a = 0;
	let b = 0;
	for (let i = 0; i < data.length; i += 89) {
		a += data[i];
		b += data[i] * ((i % 7) + 1);
	}
	return `${a.toFixed(6)}:${b.toFixed(6)}`;
}

/**
 * Build a whole case: six recordings in true chronological order, the
 * shuffled presentation the player starts from, and the two key events.
 */
export async function generateCase(seed: number): Promise<CaseFile> {
	const rand = mulberry32(seed);

	const keyTimes = {
		footsteps: 1.2 + rand() * 2.0, // into clip FOOTSTEPS_CLIP
		doorClose: 2.2 + rand() * 1.8, // into clip DOOR_CLOSE_CLIP
	};

	const events: CaseEvent[] = [];
	const clips: ClipInfo[] = [];
	for (let i = 0; i < CLIP_COUNT; i++) {
		const buffer = await renderClip(rand, i, keyTimes, events);
		const { peaks, rms } = analyse(buffer);
		clips.push({
			trueIndex: i,
			label: "",
			buffer,
			peaks,
			rms,
			checksum: checksum(buffer),
		});
	}

	// shuffle the presentation; never deal the solved order
	const presentation = clips.map((_, i) => i);
	do {
		for (let i = presentation.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[presentation[i], presentation[j]] = [presentation[j], presentation[i]];
		}
	} while (presentation.every((v, i) => v === i));

	for (let slot = 0; slot < CLIP_COUNT; slot++) {
		clips[presentation[slot]].label = LABELS[slot];
	}

	return {
		seed,
		clips,
		presentation,
		events,
		answer: {
			footsteps: { clipIndex: FOOTSTEPS_CLIP, time: keyTimes.footsteps },
			doorClose: { clipIndex: DOOR_CLOSE_CLIP, time: keyTimes.doorClose },
		},
	};
}
