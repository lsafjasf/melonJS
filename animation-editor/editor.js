// Editor wiring: stage rendering, timeline UI, transport, audio sync,
// keyframe editing and project save/load.

import {
	DURATION,
	OBJECT_IDS,
	OBJECT_LABELS,
	Clock,
	defaultProject,
	deserializeProject,
	serializeProject,
	sampleTrack,
	setKeyframe,
	removeKeyframe,
} from "./core.js";
import { STAGE_WIDTH, STAGE_HEIGHT, drawStage, drawMoon, drawBoat, drawPerson } from "./shapes.js";
import { SoundEngine } from "./audio.js";

const DRAWERS = { moon: drawMoon, boat: drawBoat, person: drawPerson };

const state = {
	project: defaultProject(),
	objectId: "moon",
	selectedKf: null, // keyframe object reference within project.tracks
	clock: new Clock(),
	sound: new SoundEngine(),
	scrubbing: false,
	wasPlayingBeforeScrub: false,
};

const els = {
	stage: document.getElementById("stage"),
	ruler: document.getElementById("ruler"),
	tracks: document.getElementById("tracks"),
	playhead: document.getElementById("playhead"),
	timeline: document.getElementById("timeline"),
	timeDisplay: document.getElementById("time-display"),
	btnPlay: document.getElementById("btn-play"),
	btnStop: document.getElementById("btn-stop"),
	chkLoop: document.getElementById("chk-loop"),
	chkSound: document.getElementById("chk-sound"),
	btnSave: document.getElementById("btn-save"),
	btnLoad: document.getElementById("btn-load"),
	btnReset: document.getElementById("btn-reset"),
	fileInput: document.getElementById("file-input"),
	objectTabs: document.getElementById("object-tabs"),
	propInputs: [...document.querySelectorAll("#props input[data-prop]")],
	btnAddKf: document.getElementById("btn-add-kf"),
	btnDelKf: document.getElementById("btn-del-kf"),
	kfStatus: document.getElementById("kf-status"),
};

const stageCtx = els.stage.getContext("2d");

function currentTrack() {
	return state.project.tracks[state.objectId];
}

function poseAt(objectId, time) {
	return sampleTrack(state.project.tracks[objectId], time);
}

// ---------- stage rendering ----------

function renderStage(time) {
	stageCtx.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
	drawStage(stageCtx, time);
	for (const id of OBJECT_IDS) {
		const pose = poseAt(id, time);
		if (pose.opacity <= 0.001) continue;
		stageCtx.save();
		stageCtx.translate(pose.x, pose.y);
		stageCtx.rotate((pose.rotation * Math.PI) / 180);
		stageCtx.scale(pose.scale, pose.scale);
		stageCtx.globalAlpha = Math.min(Math.max(pose.opacity, 0), 1);
		DRAWERS[id](stageCtx);
		stageCtx.restore();
	}
}

// ---------- main loop ----------

function frame() {
	const wrapped = state.clock.update();
	if (wrapped) state.sound.notifyLoop(state.clock.time);
	const t = state.clock.time;
	renderStage(t);
	positionPlayhead(t);
	els.timeDisplay.textContent = `${t.toFixed(2)} / ${DURATION.toFixed(2)} s`;
	if (!state.clock.playing && !state.scrubbing) {
		els.btnPlay.textContent = "▶ 播放";
	}
	if (!state.selectedKf) fillProps(poseAt(state.objectId, t));
	requestAnimationFrame(frame);
}

// ---------- timeline ----------

function tracksRect() {
	return els.tracks.getBoundingClientRect();
}

function timeToFrac(time) {
	return Math.min(Math.max(time / DURATION, 0), 1);
}

function eventToTime(evt) {
	const rect = tracksRect();
	const frac = Math.min(Math.max((evt.clientX - rect.left) / rect.width, 0), 1);
	return frac * DURATION;
}

function positionPlayhead(time) {
	els.playhead.style.left = `calc(72px + (100% - 72px) * ${timeToFrac(time)})`;
}

function drawRuler() {
	const canvas = els.ruler;
	const dpr = window.devicePixelRatio || 1;
	const width = canvas.clientWidth;
	canvas.width = width * dpr;
	canvas.height = 26 * dpr;
	const ctx = canvas.getContext("2d");
	ctx.scale(dpr, dpr);
	ctx.clearRect(0, 0, width, 26);
	ctx.fillStyle = "#7c8db3";
	ctx.strokeStyle = "#3d4f7d";
	ctx.font = "10px sans-serif";
	ctx.textAlign = "center";
	for (let s = 0; s <= DURATION; s++) {
		const x = (s / DURATION) * width;
		ctx.beginPath();
		ctx.moveTo(x, 14);
		ctx.lineTo(x, 26);
		ctx.stroke();
		ctx.fillText(`${s}s`, x, 11);
	}
}

function buildTracks() {
	els.tracks.innerHTML = "";
	for (const id of OBJECT_IDS) {
		const row = document.createElement("div");
		row.className = "track-row";
		row.dataset.object = id;
		const label = document.createElement("span");
		label.className = "track-label";
		label.textContent = OBJECT_LABELS[id];
		row.appendChild(label);
		els.tracks.appendChild(row);
	}
	refreshKeyframes();
}

function refreshKeyframes() {
	for (const row of els.tracks.querySelectorAll(".track-row")) {
		const id = row.dataset.object;
		row.classList.toggle("active", id === state.objectId);
		row.querySelectorAll(".kf-diamond").forEach((d) => d.remove());
		for (const kf of state.project.tracks[id]) {
			const diamond = document.createElement("div");
			diamond.className = "kf-diamond";
			if (kf === state.selectedKf) diamond.classList.add("selected");
			diamond.style.left = `${timeToFrac(kf.time) * 100}%`;
			diamond.title = `${OBJECT_LABELS[id]} @ ${kf.time.toFixed(2)}s`;
			diamond.addEventListener("pointerdown", (evt) => {
				evt.stopPropagation();
				selectKeyframe(id, kf);
			});
			row.appendChild(diamond);
		}
	}
	els.btnDelKf.disabled = !state.selectedKf;
	els.kfStatus.textContent = state.selectedKf
		? `已选中：${OBJECT_LABELS[state.objectId]} @ ${state.selectedKf.time.toFixed(2)}s`
		: "未选中关键帧";
}

function selectKeyframe(objectId, kf) {
	state.objectId = objectId;
	state.selectedKf = kf;
	state.clock.seek(kf.time);
	if (state.clock.playing) state.sound.seek(kf.time);
	syncTabs();
	refreshKeyframes();
	fillProps(kf.pose);
}

function clearSelection() {
	state.selectedKf = null;
	refreshKeyframes();
}

// Scrubbing: press on the ruler or a track row (not on a diamond) and drag.
function beginScrub(evt) {
	state.scrubbing = true;
	state.wasPlayingBeforeScrub = state.clock.playing;
	if (state.clock.playing) state.sound.stop();
	seekToEvent(evt);
	window.addEventListener("pointermove", seekToEvent);
	window.addEventListener("pointerup", endScrub, { once: true });
}

function seekToEvent(evt) {
	const time = eventToTime(evt);
	state.clock.seek(time);
	clearSelection();
}

function endScrub(evt) {
	window.removeEventListener("pointermove", seekToEvent);
	state.scrubbing = false;
	seekToEvent(evt);
	if (state.wasPlayingBeforeScrub && state.clock.playing) {
		state.sound.start(state.clock.time);
	}
}

// ---------- properties panel ----------

function fillProps(pose) {
	for (const input of els.propInputs) {
		const prop = input.dataset.prop;
		input.value = Number(pose[prop].toFixed(3));
	}
}

function readProps() {
	const pose = {};
	for (const input of els.propInputs) {
		pose[input.dataset.prop] = Number(input.value) || 0;
	}
	return pose;
}

function onPropInput() {
	const pose = readProps();
	if (state.selectedKf) {
		// editing a selected keyframe updates it in place
		Object.assign(state.selectedKf.pose, pose);
	} else {
		// no selection: upsert a keyframe at the playhead so the edit sticks
		const kf = setKeyframe(currentTrack(), state.clock.time, pose);
		state.selectedKf = kf;
	}
	refreshKeyframes();
}

function addKeyframeAtPlayhead() {
	const pose = state.selectedKf ? readProps() : poseAt(state.objectId, state.clock.time);
	const kf = setKeyframe(currentTrack(), state.clock.time, pose);
	state.selectedKf = kf;
	refreshKeyframes();
	fillProps(kf.pose);
}

function deleteSelectedKeyframe() {
	if (!state.selectedKf) return;
	removeKeyframe(currentTrack(), state.selectedKf.time);
	state.selectedKf = null;
	refreshKeyframes();
}

// ---------- object tabs ----------

function buildTabs() {
	els.objectTabs.innerHTML = "";
	for (const id of OBJECT_IDS) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.textContent = OBJECT_LABELS[id];
		btn.dataset.object = id;
		btn.addEventListener("click", () => {
			state.objectId = id;
			state.selectedKf = null;
			syncTabs();
			refreshKeyframes();
		});
		els.objectTabs.appendChild(btn);
	}
	syncTabs();
}

function syncTabs() {
	for (const btn of els.objectTabs.querySelectorAll("button")) {
		btn.classList.toggle("active", btn.dataset.object === state.objectId);
	}
}

// ---------- transport ----------

function togglePlay() {
	if (state.clock.playing) {
		state.clock.pause();
		state.sound.stop();
		els.btnPlay.textContent = "▶ 播放";
	} else {
		if (state.clock.time >= DURATION) state.clock.seek(0);
		state.clock.play();
		if (state.soundEnabled) state.sound.start(state.clock.time);
		els.btnPlay.textContent = "⏸ 暂停";
	}
}

function stopAll() {
	state.clock.stop();
	state.sound.stop();
	els.btnPlay.textContent = "▶ 播放";
}

// ---------- project save / load ----------

function saveProject() {
	const json = serializeProject(state.project);
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = "animation-project.json";
	a.click();
	URL.revokeObjectURL(url);
	try {
		localStorage.setItem("animation-editor-project", json);
	} catch {
		/* storage unavailable: the download still works */
	}
}

function loadProjectFromText(text) {
	try {
		state.project = deserializeProject(text);
	} catch (err) {
		alert(`载入失败：${err.message}`);
		return;
	}
	stopAll();
	state.selectedKf = null;
	state.clock.seek(0);
	refreshKeyframes();
}

function resetProject() {
	stopAll();
	state.project = defaultProject();
	state.selectedKf = null;
	state.clock.seek(0);
	refreshKeyframes();
}

// ---------- wiring ----------

function init() {
	els.stage.width = STAGE_WIDTH;
	els.stage.height = STAGE_HEIGHT;
	state.soundEnabled = true;

	buildTabs();
	buildTracks();
	drawRuler();
	window.addEventListener("resize", drawRuler);

	els.ruler.addEventListener("pointerdown", beginScrub);
	els.tracks.addEventListener("pointerdown", (evt) => {
		if (evt.target.closest(".kf-diamond")) return;
		beginScrub(evt);
	});

	els.btnPlay.addEventListener("click", togglePlay);
	els.btnStop.addEventListener("click", stopAll);
	els.chkLoop.addEventListener("change", () => {
		state.clock.loop = els.chkLoop.checked;
	});
	els.chkSound.addEventListener("change", () => {
		state.soundEnabled = els.chkSound.checked;
		if (!state.soundEnabled) state.sound.stop();
		else if (state.clock.playing) state.sound.start(state.clock.time);
	});

	for (const input of els.propInputs) input.addEventListener("input", onPropInput);
	els.btnAddKf.addEventListener("click", addKeyframeAtPlayhead);
	els.btnDelKf.addEventListener("click", deleteSelectedKeyframe);
	window.addEventListener("keydown", (evt) => {
		if (evt.target.tagName === "INPUT") return;
		if (evt.key === "Delete" || evt.key === "Backspace") deleteSelectedKeyframe();
		if (evt.key === " ") {
			evt.preventDefault();
			togglePlay();
		}
	});

	els.btnSave.addEventListener("click", saveProject);
	els.btnLoad.addEventListener("click", () => els.fileInput.click());
	els.fileInput.addEventListener("change", async () => {
		const file = els.fileInput.files[0];
		if (file) loadProjectFromText(await file.text());
		els.fileInput.value = "";
	});
	els.btnReset.addEventListener("click", resetProject);

	// restore the last saved session when available
	try {
		const saved = localStorage.getItem("animation-editor-project");
		if (saved) state.project = deserializeProject(saved);
	} catch {
		/* corrupted cache: fall back to the demo project */
	}
	refreshKeyframes();
	requestAnimationFrame(frame);
}

init();

// exposed for smoke tests and debugging
window.__editor = state;
