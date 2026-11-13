/**
 * melonJS — audio restoration lab: the "old recording" synthesis.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Everything here is generated with Web Audio — an
 * `OfflineAudioContext` renders the clean source, then a second offline
 * render adds the damage. No external audio assets are needed, and the
 * damaged buffer is the only thing the app ever keeps: the clean render is
 * dropped on purpose so nothing downstream can "fix" the recording by
 * reading it.
 */

/** length of the fictional recording, in seconds */
export const RECORDING_SECONDS = 10;

/** sample rate used for both offline rendering and live playback */
export const SAMPLE_RATE = 44_100;

/** number of channels of the mono recording */
export const CHANNELS = 1;

/**
 * Renders a ten-second piece of fictional "programme material": a short
 * arpeggiated melody over a quiet sustained pad, with a gentle amplitude
 * envelope so notes have real attack and decay. Pure synthesis through an
 * `OfflineAudioContext`, no samples involved.
 */
const renderCleanSource = (): Promise<AudioBuffer> => {
	const off = new OfflineAudioContext(
		CHANNELS,
		RECORDING_SECONDS * SAMPLE_RATE,
		SAMPLE_RATE,
	);

	const padGain = off.createGain();
	padGain.gain.value = 0.08;
	padGain.connect(off.destination);

	// a soft two-oscillator pad, one detuned oscillator per note
	for (const freq of [220, 277.18]) {
		const osc = off.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.value = freq;
		const padFilter = off.createBiquadFilter();
		padFilter.type = "lowpass";
		padFilter.frequency.value = 900;
		osc.connect(padFilter);
		padFilter.connect(padGain);
		osc.start(0);
		osc.stop(RECORDING_SECONDS);
	}

	// an arpeggio of triangle notes, each with its own envelope
	const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25];
	const noteLength = 0.72;
	const noteStart = 0.6;
	for (let note = 0; note < 12; note += 1) {
		const freq = melody[note % melody.length] ?? 523.25;
		const start = noteStart + note * noteLength;
		const osc = off.createOscillator();
		osc.type = "triangle";
		osc.frequency.value = freq;
		const noteGain = off.createGain();
		noteGain.gain.setValueAtTime(0.0001, start);
		noteGain.gain.exponentialRampToValueAtTime(0.55, start + 0.03);
		noteGain.gain.exponentialRampToValueAtTime(
			0.0001,
			start + noteLength * 0.9,
		);
		osc.connect(noteGain);
		noteGain.connect(off.destination);
		osc.start(start);
		osc.stop(start + noteLength);
	}

	return off.startRendering();
};

/**
 * Deterministic, re-seedable PRNG (mulberry32) so every render of the
 * recording gets the same crackle pattern until the player asks for a new
 * take. The damage is still "random" per take, just reproducible per seed.
 */
const makeRng = (seed: number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
	};
};

/**
 * Adds the four kinds of age damage straight onto a rendered buffer's
 * samples, sample by sample:
 *
 * - low-frequency rumble / brownish noise (the "muffled" bed),
 * - 50 Hz mains hum plus a 150 Hz harmonic (the "ac" buzz),
 * - sparse loud clicks (the "pops and crackle"),
 * - hard clipping of the loudest peaks (the "slight clipping").
 *
 * A new `AudioBuffer` is returned; the clean buffer passed in is never
 * written to.
 */
const addAgeDamage = (clean: AudioBuffer, seed: number): AudioBuffer => {
	const length = clean.length;
	// a throwaway context just to allocate the output AudioBuffer; the
	// damage itself is sample math, not a rendered graph
	const ctx = new OfflineAudioContext(CHANNELS, 1, SAMPLE_RATE);
	const damaged = ctx.createBuffer(CHANNELS, length, SAMPLE_RATE);
	const input = clean.getChannelData(0);
	const output = damaged.getChannelData(0);
	const rng = makeRng(seed);

	// brown-noise integrator state for the rumble bed
	let rumble = 0;
	for (let i = 0; i < length; i += 1) {
		const time = i / SAMPLE_RATE;

		// rumble: integrated white noise drifts slowly, kept small
		rumble = rumble * 0.999_6 + (rng() * 2 - 1) * 0.012;

		// mains hum: 50 Hz fundamental plus a quieter third harmonic
		const hum =
			0.055 * Math.sin(2 * Math.PI * 50 * time) +
			0.02 * Math.sin(2 * Math.PI * 150 * time);

		// crackle: about 90 random clicks across the ten seconds
		let click = 0;
		if (rng() < 0.000_2) {
			const polarity = rng() > 0.5 ? 1 : -1;
			click = polarity * (0.6 + rng() * 0.5);
		}

		// gentle broadband tape hiss so the noise gate has something to gate
		const hiss = (rng() * 2 - 1) * 0.01;

		// hard clip at 0.999: the loudest peaks are flattened exactly at
		// the lab's clip threshold, so the clip counters can see them
		const mixed = input[i] + rumble + hum + click + hiss;
		output[i] = Math.max(-0.999, Math.min(0.999, mixed));
	}

	return damaged;
};

/**
 * Synthesizes the full fictional old recording and returns its damaged
 * ten-second mono buffer. The clean source is rendered and discarded, so
 * the returned buffer is the only material the rest of the app can touch.
 *
 * @param seed - PRNG seed; pass a new value to generate a new "take"
 */
export const synthesizeOldRecording = async (
	seed = 1,
): Promise<AudioBuffer> => {
	const clean = await renderCleanSource();
	return addAgeDamage(clean, seed);
};
