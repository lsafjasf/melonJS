// Core animation logic: keyframe tracks, interpolation, project IO, clock.
// Pure module with no DOM/WebAudio dependencies so it can be tested in Node.

export const DURATION = 12; // seconds

export const OBJECT_IDS = ["moon", "boat", "person"];

export const OBJECT_LABELS = {
	moon: "月亮",
	boat: "纸船",
	person: "小人",
};

// A pose is the full set of animatable properties held by one keyframe.
export function makePose(overrides = {}) {
	return {
		x: 0,
		y: 0,
		rotation: 0, // degrees
		scale: 1,
		opacity: 1,
		...overrides,
	};
}

export function makeKeyframe(time, pose) {
	return { time, pose: makePose(pose) };
}

function lerp(a, b, t) {
	return a + (b - a) * t;
}

// Sort a track's keyframes by time.
export function sortTrack(keyframes) {
	keyframes.sort((a, b) => a.time - b.time);
	return keyframes;
}

// Find the index of a keyframe at (approximately) `time`, or -1.
export function findKeyframeIndex(keyframes, time, epsilon = 1e-4) {
	return keyframes.findIndex((kf) => Math.abs(kf.time - time) <= epsilon);
}

// Insert or replace a keyframe at `time`. Returns the keyframe.
export function setKeyframe(keyframes, time, pose) {
	const clamped = Math.min(Math.max(time, 0), DURATION);
	const existing = findKeyframeIndex(keyframes, clamped);
	if (existing >= 0) {
		keyframes[existing].pose = makePose(pose);
		return keyframes[existing];
	}
	const kf = makeKeyframe(clamped, pose);
	keyframes.push(kf);
	sortTrack(keyframes);
	return kf;
}

// Remove the keyframe nearest to `time`. Returns true when one was removed.
export function removeKeyframe(keyframes, time, epsilon = 1e-4) {
	const index = findKeyframeIndex(keyframes, time, epsilon);
	if (index < 0) return false;
	keyframes.splice(index, 1);
	return true;
}

// Sample a track at `time` with linear interpolation between neighbours.
// Outside the keyframe range the nearest pose is held (clamped).
export function sampleTrack(keyframes, time) {
	if (keyframes.length === 0) return makePose();
	if (time <= keyframes[0].time) return makePose(keyframes[0].pose);
	const last = keyframes[keyframes.length - 1];
	if (time >= last.time) return makePose(last.pose);
	for (let i = 0; i < keyframes.length - 1; i++) {
		const a = keyframes[i];
		const b = keyframes[i + 1];
		if (time >= a.time && time <= b.time) {
			const span = b.time - a.time;
			const t = span === 0 ? 0 : (time - a.time) / span;
			return makePose({
				x: lerp(a.pose.x, b.pose.x, t),
				y: lerp(a.pose.y, b.pose.y, t),
				rotation: lerp(a.pose.rotation, b.pose.rotation, t),
				scale: lerp(a.pose.scale, b.pose.scale, t),
				opacity: lerp(a.pose.opacity, b.pose.opacity, t),
			});
		}
	}
	return makePose(last.pose);
}

// The shipped demo: the moon rises first, the paper boat crosses the
// stage, and only then does the little person wave.
export function defaultProject() {
	return {
		version: 1,
		duration: DURATION,
		tracks: {
			moon: [
				makeKeyframe(0, { x: 700, y: 430, rotation: 0, scale: 0.6, opacity: 0 }),
				makeKeyframe(1.5, { x: 700, y: 400, rotation: 0, scale: 0.7, opacity: 1 }),
				makeKeyframe(5, { x: 720, y: 120, rotation: 0, scale: 1, opacity: 1 }),
				makeKeyframe(12, { x: 740, y: 90, rotation: 0, scale: 1, opacity: 1 }),
			],
			boat: [
				makeKeyframe(0, { x: -120, y: 400, rotation: 0, scale: 1, opacity: 1 }),
				makeKeyframe(3, { x: -120, y: 400, rotation: -4, scale: 1, opacity: 1 }),
				makeKeyframe(4.5, { x: 200, y: 395, rotation: 5, scale: 1, opacity: 1 }),
				makeKeyframe(6, { x: 480, y: 405, rotation: -5, scale: 1, opacity: 1 }),
				makeKeyframe(7.5, { x: 760, y: 395, rotation: 4, scale: 1, opacity: 1 }),
				makeKeyframe(9, { x: 1080, y: 400, rotation: 0, scale: 1, opacity: 1 }),
				makeKeyframe(12, { x: 1080, y: 400, rotation: 0, scale: 1, opacity: 1 }),
			],
			person: [
				makeKeyframe(0, { x: 830, y: 330, rotation: 0, scale: 1, opacity: 0 }),
				makeKeyframe(8, { x: 830, y: 330, rotation: 0, scale: 1, opacity: 0 }),
				makeKeyframe(8.6, { x: 830, y: 330, rotation: 0, scale: 1, opacity: 1 }),
				makeKeyframe(9.2, { x: 830, y: 330, rotation: -12, scale: 1, opacity: 1 }),
				makeKeyframe(9.8, { x: 830, y: 330, rotation: 12, scale: 1, opacity: 1 }),
				makeKeyframe(10.4, { x: 830, y: 330, rotation: -12, scale: 1, opacity: 1 }),
				makeKeyframe(11, { x: 830, y: 330, rotation: 12, scale: 1, opacity: 1 }),
				makeKeyframe(11.6, { x: 830, y: 330, rotation: 0, scale: 1, opacity: 1 }),
				makeKeyframe(12, { x: 830, y: 330, rotation: 0, scale: 1, opacity: 1 }),
			],
		},
	};
}

// Deep-clone a project through JSON so callers cannot mutate shared state.
export function serializeProject(project) {
	return JSON.stringify(project, null, 2);
}

// Parse and validate a project JSON string. Throws on malformed data.
export function deserializeProject(json) {
	const data = typeof json === "string" ? JSON.parse(json) : json;
	if (!data || typeof data !== "object" || !data.tracks) {
		throw new Error("不是有效的工程文件：缺少 tracks");
	}
	const project = { version: 1, duration: DURATION, tracks: {} };
	for (const id of OBJECT_IDS) {
		const list = Array.isArray(data.tracks[id]) ? data.tracks[id] : [];
		project.tracks[id] = sortTrack(
			list.map((kf) => {
				if (typeof kf.time !== "number" || !Number.isFinite(kf.time)) {
					throw new Error(`关键帧时间无效（${id}）`);
				}
				return makeKeyframe(Math.min(Math.max(kf.time, 0), DURATION), kf.pose);
			}),
		);
	}
	return project;
}

// Playback clock with loop / pause / seek, driven by an injectable
// time source so it can be stepped deterministically in tests.
export class Clock {
	constructor(now = () => performance.now() / 1000) {
		this.now = now;
		this.time = 0; // animation time in [0, DURATION)
		this.playing = false;
		this.loop = true;
		this.loopCount = 0; // how many times the playhead has wrapped
		this._startStamp = 0; // wall-clock stamp when play began
		this._startTime = 0; // animation time when play began
	}

	play() {
		if (this.playing) return;
		this.playing = true;
		this._startStamp = this.now();
		this._startTime = this.time;
	}

	pause() {
		if (!this.playing) return;
		this.update();
		this.playing = false;
	}

	stop() {
		this.playing = false;
		this.time = 0;
		this.loopCount = 0;
	}

	seek(time) {
		this.time = Math.min(Math.max(time, 0), DURATION);
		this.loopCount = 0;
		if (this.playing) {
			this._startStamp = this.now();
			this._startTime = this.time;
		}
	}

	// Advance from the wall clock; returns true when the playhead wrapped.
	update() {
		if (!this.playing) return false;
		const elapsed = this.now() - this._startStamp;
		let t = this._startTime + elapsed;
		let wrapped = false;
		if (t >= DURATION) {
			if (this.loop) {
				const wraps = Math.floor(t / DURATION);
				this.loopCount += wraps;
				t -= wraps * DURATION;
				this._startStamp += wraps * DURATION;
				this._startTime = t;
				wrapped = true;
			} else {
				t = DURATION;
				this.playing = false;
			}
		}
		this.time = t;
		return wrapped;
	}
}
