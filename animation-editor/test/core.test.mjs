// Run with: node --test test/
import test from "node:test";
import assert from "node:assert/strict";
import {
	DURATION,
	Clock,
	defaultProject,
	deserializeProject,
	serializeProject,
	sampleTrack,
	setKeyframe,
	removeKeyframe,
	findKeyframeIndex,
	makeKeyframe,
} from "../core.js";
import { PADDLE_TIMES, CHIME_TIME, paddleWindow } from "../audio.js";

// --- interpolation ---

test("linear interpolation between two keyframes", () => {
	const track = [
		makeKeyframe(2, { x: 0, y: 100, rotation: 0, scale: 1, opacity: 0 }),
		makeKeyframe(6, { x: 400, y: 200, rotation: 90, scale: 2, opacity: 1 }),
	];
	const mid = sampleTrack(track, 4);
	assert.equal(mid.x, 200);
	assert.equal(mid.y, 150);
	assert.equal(mid.rotation, 45);
	assert.equal(mid.scale, 1.5);
	assert.equal(mid.opacity, 0.5);
});

test("pose clamps outside the keyframe range", () => {
	const track = [makeKeyframe(3, { x: 10 }), makeKeyframe(5, { x: 20 })];
	assert.equal(sampleTrack(track, 0).x, 10);
	assert.equal(sampleTrack(track, 12).x, 20);
});

test("scrubbing the playhead yields live interpolated values", () => {
	const track = [makeKeyframe(0, { x: 0 }), makeKeyframe(12, { x: 960 })];
	for (const t of [0, 1.5, 3.3, 7.7, 11.9, 12]) {
		assert.ok(Math.abs(sampleTrack(track, t).x - (t / 12) * 960) < 1e-9);
	}
});

// --- keyframe add / delete / reselect ---

test("setKeyframe inserts sorted and replaces at the same time", () => {
	const track = [];
	setKeyframe(track, 5, { x: 50 });
	setKeyframe(track, 1, { x: 10 });
	setKeyframe(track, 9, { x: 90 });
	assert.deepEqual(track.map((k) => k.time), [1, 5, 9]);
	setKeyframe(track, 5, { x: 555 });
	assert.equal(track.length, 3);
	assert.equal(track[1].pose.x, 555);
});

test("removeKeyframe deletes and reselection still finds neighbours", () => {
	const track = [makeKeyframe(1, {}), makeKeyframe(2, {}), makeKeyframe(3, {})];
	assert.equal(removeKeyframe(track, 2), true);
	assert.equal(track.length, 2);
	assert.equal(removeKeyframe(track, 2), false);
	assert.equal(findKeyframeIndex(track, 1), 0);
	assert.equal(findKeyframeIndex(track, 3), 1);
});

test("keyframes are clamped to the 12 second stage", () => {
	const track = [];
	const kf = setKeyframe(track, 99, { x: 1 });
	assert.equal(kf.time, DURATION);
});

// --- clock: loop / pause / seek ---

function manualClock() {
	let now = 0;
	const clock = new Clock(() => now);
	return { clock, advance: (s) => (now += s) };
}

test("pause freezes the playhead, play resumes from the same time", () => {
	const { clock, advance } = manualClock();
	clock.play();
	advance(3);
	clock.update();
	assert.ok(Math.abs(clock.time - 3) < 1e-9);
	clock.pause();
	advance(5);
	clock.update();
	assert.ok(Math.abs(clock.time - 3) < 1e-9);
	clock.play();
	advance(1);
	clock.update();
	assert.ok(Math.abs(clock.time - 4) < 1e-9);
});

test("loop wraps the playhead and counts wraps", () => {
	const { clock, advance } = manualClock();
	clock.loop = true;
	clock.play();
	advance(12.5);
	const wrapped = clock.update();
	assert.equal(wrapped, true);
	assert.ok(Math.abs(clock.time - 0.5) < 1e-9);
	assert.equal(clock.loopCount, 1);
	advance(12);
	clock.update();
	assert.equal(clock.loopCount, 2);
});

test("without loop the clock stops at the end", () => {
	const { clock, advance } = manualClock();
	clock.loop = false;
	clock.play();
	advance(20);
	clock.update();
	assert.equal(clock.time, DURATION);
	assert.equal(clock.playing, false);
});

test("seek during playback re-anchors the clock", () => {
	const { clock, advance } = manualClock();
	clock.play();
	advance(4);
	clock.update();
	clock.seek(8);
	advance(1);
	clock.update();
	assert.ok(Math.abs(clock.time - 9) < 1e-9);
});

// --- save / restore ---

test("project survives a JSON round-trip", () => {
	const project = defaultProject();
	setKeyframe(project.tracks.moon, 6.5, { x: 123, opacity: 0.25 });
	removeKeyframe(project.tracks.boat, 4.5);
	const restored = deserializeProject(serializeProject(project));
	assert.deepEqual(restored, project);
});

test("deserializing rejects malformed input", () => {
	assert.throws(() => deserializeProject("{}"));
	assert.throws(() => deserializeProject('{"tracks":{"moon":[{"time":"x"}]}}'));
});

// --- demo project sanity ---

test("demo project: moon rises, boat crosses, person waves last", () => {
	const p = defaultProject();
	assert.ok(sampleTrack(p.tracks.moon, 0).opacity === 0);
	assert.ok(sampleTrack(p.tracks.moon, 2).opacity > 0);
	assert.ok(sampleTrack(p.tracks.boat, 3).x < 0);
	assert.ok(sampleTrack(p.tracks.boat, 9).x > 960);
	assert.ok(sampleTrack(p.tracks.person, 7).opacity === 0);
	assert.ok(sampleTrack(p.tracks.person, 9).opacity > 0);
	const r1 = sampleTrack(p.tracks.person, 9.4).rotation;
	const r2 = sampleTrack(p.tracks.person, 10.0).rotation;
	assert.ok(r1 * r2 < 0, "wave should swing through zero");
});

test("audio cues: paddles while the boat moves, chime when person appears", () => {
	const { from, to } = paddleWindow();
	assert.ok(from >= 3 && to <= 9);
	assert.ok(PADDLE_TIMES.length >= 6);
	assert.ok(CHIME_TIME >= 8 && CHIME_TIME <= 9);
});
