/**
 * Pure acoustic maths for the binaural workbench: localisation cues,
 * Sabine reverberation and a procedurally generated stereo impulse
 * response. Nothing here touches the Web Audio API, so every function
 * is deterministic and unit-testable in plain Node.
 */
import type {
	PlanPoint,
	RoomDimensions,
	SpatialCues,
	SpatialState,
	WallMaterial,
} from "./types";

/** speed of sound in air, metres per second */
export const SPEED_OF_SOUND = 343;
/** reference listening distance, metres: gain is 1 at or closer */
export const REFERENCE_DISTANCE = 1;
/** head radius used for the interaural time difference, metres */
export const HEAD_RADIUS = 0.0875;
/** open cutoff for a source in front of the listener, Hz */
export const FRONT_FILTER_HZ = 12000;
/** muffled cutoff for a source directly behind, Hz */
export const BACK_FILTER_HZ = 900;

const TWO_PI = Math.PI * 2;

/** wrap an angle into -PI..PI */
export const wrapAngle = (angle: number): number => {
	let wrapped = angle % TWO_PI;
	if (wrapped > Math.PI) {
		wrapped -= TWO_PI;
	} else if (wrapped < -Math.PI) {
		wrapped += TWO_PI;
	}
	return wrapped;
};

/**
 * Compute the localisation cues for one source relative to one
 * listener. Pan follows equal-power law on the relative azimuth, so a
 * source straight left gives pan -1 and straight right pan +1.
 */
export const computeSpatialCues = (state: SpatialState): SpatialCues => {
	const dx = state.source.x - state.listener.x;
	const dy = state.source.y - state.listener.y;
	const distance = Math.hypot(dx, dy);

	// World angle of the source as seen from the listener, then made
	// relative to the way the listener faces.
	const worldAngle = Math.atan2(dy, dx);
	const azimuth = wrapAngle(worldAngle - state.listenerHeading);

	// Equal-power pan: map -PI..PI onto -1..1 linearly in angle. Pan
	// sign therefore tracks left/right inversion directly.
	const pan = Math.max(-1, Math.min(1, (2 * azimuth) / Math.PI));

	// Inverse distance with a clamped near field, matching Web Audio's
	// inverse distanceModel at refDistance = 1 m.
	const distanceGain =
		REFERENCE_DISTANCE / Math.max(REFERENCE_DISTANCE, distance);

	// Front/back filtering: behind the heading the high end is rolled
	// off, fully closed at directly behind.
	const behindFactor = Math.max(0, Math.cos(azimuth - Math.PI) * 0.5 + 0.5);
	const frontBackFilterHz =
		FRONT_FILTER_HZ +
		(BACK_FILTER_HZ - FRONT_FILTER_HZ) * behindFactor * behindFactor;

	return {
		azimuth,
		distance,
		behind: Math.abs(azimuth) > Math.PI / 2,
		pan,
		distanceGain,
		frontBackFilterHz,
	};
};

/** equal-power gain for the left channel at a given pan (-1..1) */
export const equalPowerLeft = (pan: number): number =>
	Math.cos(((pan + 1) * Math.PI) / 4);

/** equal-power gain for the right channel at a given pan (-1..1) */
export const equalPowerRight = (pan: number): number =>
	Math.sin(((pan + 1) * Math.PI) / 4);

/**
 * Interaural time difference for a relative azimuth, seconds. The
 * Woodworth approximation: delay peaks at roughly 0.66 ms at +/-90°.
 */
export const interauralTimeDifference = (azimuth: number): number => {
	const lateral = Math.max(-1, Math.min(1, Math.sin(azimuth)));
	return (HEAD_RADIUS / SPEED_OF_SOUND) * (lateral + azimuth);
};

/**
 * Sabine reverberation time T60 for a rectangular room, seconds.
 * T60 = 0.161 * V / A, where A is total absorption in sabins. All six
 * surfaces share the selected material's coefficient.
 */
export const sabineRt60 = (
	room: RoomDimensions,
	material: WallMaterial,
): number => {
	const { width, depth, height } = room;
	const volume = width * depth * height;
	const surfaceArea = 2 * (width * depth + width * height + depth * height);
	const absorption = Math.max(surfaceArea * material.absorption, 0.001);
	return (0.161 * volume) / absorption;
};

/** deterministic, seedable PRNG so an IR is reproducible for a room */
export const createRng = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		// LCG constants from Numerical Recipes, good enough for noise.
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
};

interface Reflection {
	delaySec: number;
	gain: number;
	azimuth: number;
}

/**
 * First-order image-source reflections off the four vertical walls.
 * Each image source gives a real delay and an arrival direction at the
 * listener, which is what lets the early field carry spatial cues.
 */
const wallReflections = (
	room: RoomDimensions,
	source: PlanPoint,
	listener: PlanPoint,
	material: WallMaterial,
	heading: number,
): Reflection[] => {
	const images: PlanPoint[] = [
		{ x: -source.x, y: source.y },
		{ x: 2 * room.width - source.x, y: source.y },
		{ x: source.x, y: -source.y },
		{ x: source.x, y: 2 * room.depth - source.y },
	];
	const reflectionGain = 1 - material.absorption;
	return images.map((image) => {
		const dx = image.x - listener.x;
		const dy = image.y - listener.y;
		const pathLength = Math.hypot(dx, dy);
		return {
			delaySec: pathLength / SPEED_OF_SOUND,
			gain: reflectionGain / Math.max(1, pathLength),
			azimuth: wrapAngle(Math.atan2(dy, dx) - heading),
		};
	});
};

/**
 * A generated stereo impulse response kept as plain interleavable
 * arrays. The audio graph turns this into an AudioBuffer.
 */
export interface StereoImpulseResponse {
	sampleRate: number;
	lengthSamples: number;
	left: Float32Array<ArrayBuffer>;
	right: Float32Array<ArrayBuffer>;
	rt60: number;
}

/**
 * Build a procedural binaural impulse response.
 *
 * The direct path plus four first-order wall reflections become
 * localised clicks (per-ear delay and equal-power pan from the arrival
 * azimuth). A decaying, decorrelated noise tail models the late
 * reverberant field, with the decay rate taken from the room's Sabine
 * T60. A fixed seed makes the result reproducible for a given room.
 */
export const generateImpulseResponse = (
	sampleRate: number,
	room: RoomDimensions,
	material: WallMaterial,
	source: PlanPoint,
	listener: PlanPoint,
	heading = 0,
): StereoImpulseResponse => {
	const rt60 = sabineRt60(room, material);
	// Cap the tail so convolvers stay cheap in the small-hall preset.
	const durationSec = Math.min(3, Math.max(0.5, rt60 * 0.8));
	const lengthSamples = Math.floor(durationSec * sampleRate);
	const left = new Float32Array(lengthSamples);
	const right = new Float32Array(lengthSamples);

	const placeTap = (delaySec: number, gain: number, azimuth: number) => {
		const pan = Math.max(-1, Math.min(1, (2 * azimuth) / Math.PI));
		// Positive ITD delays the right ear (source on the left),
		// negative ITD delays the left ear (source on the right).
		const itd = interauralTimeDifference(azimuth);
		const leftIndex = Math.round(
			Math.max(0, delaySec + Math.max(0, -itd)) * sampleRate,
		);
		const rightIndex = Math.round(
			Math.max(0, delaySec + Math.max(0, itd)) * sampleRate,
		);
		if (leftIndex < lengthSamples) {
			left[leftIndex] += gain * equalPowerLeft(pan);
		}
		if (rightIndex < lengthSamples) {
			right[rightIndex] += gain * equalPowerRight(pan);
		}
	};

	// Direct path.
	const directDistance = Math.hypot(
		source.x - listener.x,
		source.y - listener.y,
	);
	placeTap(
		directDistance / SPEED_OF_SOUND,
		1 / Math.max(1, directDistance),
		computeSpatialCues({ source, listener, listenerHeading: heading }).azimuth,
	);

	// First-order wall reflections.
	for (const reflection of wallReflections(
		room,
		source,
		listener,
		material,
		heading,
	)) {
		placeTap(reflection.delaySec, reflection.gain, reflection.azimuth);
	}

	// Late field: exponential-decay noise, -60 dB at T60. Independent
	// noise per channel decorrelates the tail so it wraps around the
	// head rather than collapsing to the centre.
	const rngLeft = createRng(0x9e3779b9);
	const rngRight = createRng(0x85ebca6b);
	const decayPerSample = 0.001 ** (1 / (rt60 * sampleRate));
	let envelope = 0.35;
	const lateStart = Math.floor(0.02 * sampleRate);
	for (let i = lateStart; i < lengthSamples; i += 1) {
		envelope *= decayPerSample;
		left[i] += (rngLeft() * 2 - 1) * envelope;
		right[i] += (rngRight() * 2 - 1) * envelope;
	}

	return { sampleRate, lengthSamples, left, right, rt60 };
};
