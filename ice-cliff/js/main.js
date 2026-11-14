// 入口：相机、UI、渲染循环、延时录制、截图。

import { perspective, lookAt, multiply } from "./math.js";
import { createRenderer } from "./renderer.js";

const canvas = document.getElementById("view");
const $ = (id) => document.getElementById(id);

let renderer;
try {
	renderer = createRenderer(canvas);
} catch (e) {
	const err = $("err");
	err.style.display = "grid";
	err.textContent = "无法初始化 WebGL2：" + e.message;
	throw e;
}

// ---- 状态 ----
const params = new URLSearchParams(location.search);
const state = {
	az: ((Number(params.get("az")) || 35) * Math.PI) / 180,
	el: ((Number(params.get("el")) || 16) * Math.PI) / 180,
	radius: Number(params.get("r")) || 15,
	target: [0, 0.6, 0],
	sunEl: 42,
	fog: 0.022,
	cut: 0, // 剖切目标值 0..1
	cutShown: 0, // 实际渲染用的平滑值（慢慢切）
	night: false,
	nightMix: 0,
	seed: params.get("seed") || "ice-7",
	time: 0,
	timelapse: null,
};
$("seed").value = state.seed;
renderer.setSeed(state.seed);

// ---- 相机 ----
function camera() {
	const ce = Math.cos(state.el);
	const eye = [
		state.target[0] + state.radius * ce * Math.sin(state.az),
		state.target[1] + state.radius * Math.sin(state.el),
		state.target[2] + state.radius * ce * Math.cos(state.az),
	];
	const fwd = [
		state.target[0] - eye[0],
		state.target[1] - eye[1],
		state.target[2] - eye[2],
	];
	const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
	fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
	// right = normalize(cross(fwd, worldUp))
	let rx = -fwd[2];
	let rz = fwd[0];
	const rl = Math.hypot(rx, rz) || 1;
	rx /= rl; rz /= rl;
	// up = cross(right, fwd)
	const up = [
		-rz * fwd[1],
		rz * fwd[0] - rx * fwd[2],
		rx * fwd[1],
	];
	return { eye, fwd, right: [rx, 0, rz], up };
}

function sunDirection() {
	const el = (state.sunEl * Math.PI) / 180;
	const az = (60 * Math.PI) / 180;
	return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}

function sunColor() {
	// 正午偏白，黄昏偏橙；夜间转为冷色月光
	const t = Math.min(1, Math.max(0, (state.sunEl - 2) / 40));
	const day = [
		1.0,
		0.45 + 0.52 * t,
		0.18 + 0.72 * t,
	];
	const night = [0.55, 0.68, 0.9];
	const m = state.nightMix;
	return [
		day[0] * (1 - m) + night[0] * m,
		day[1] * (1 - m) + night[1] * m,
		day[2] * (1 - m) + night[2] * m,
	];
}

// ---- 渲染循环 ----
const FOV = (50 * Math.PI) / 180;
let frames = 0;
let fpsT = performance.now();
let lastT = performance.now();

function resize() {
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const w = Math.round(canvas.clientWidth * dpr);
	const h = Math.round(canvas.clientHeight * dpr);
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
}

function renderFrame() {
	resize();
	const cam = camera();
	const aspect = canvas.width / Math.max(1, canvas.height);
	const proj = perspective(FOV, aspect, 0.1, 400);
	const view = lookAt(cam.eye, state.target, [0, 1, 0]);
	const viewProj = multiply(proj, view);

	// 剖切平面：保留 z <= planeZ 的部分，cut 从 0（不切）到 1（几乎切完）
	const planeZ = 5.2 + (-3.8 - 5.2) * state.cutShown;
	const clip = [0, 0, -1, planeZ];

	// 雾色跟随太阳颜色：正午浅灰蓝、黄昏暖灰、夜间深蓝
	const sc = sunColor();
	const dim = 1 - 0.85 * state.nightMix;
	const fogColor = [
		(sc[0] * 0.45 + 0.3) * dim,
		(sc[1] * 0.45 + 0.34) * dim,
		(sc[2] * 0.45 + 0.42) * dim,
	];

	renderer.draw({
		viewProj,
		camPos: cam.eye,
		camRight: cam.right,
		camUp: cam.up,
		camFwd: cam.fwd,
		tanFov: Math.tan(FOV / 2),
		aspect,
		sunDir: sunDirection(),
		sunColor: sunColor(),
		night: state.nightMix,
		fogDensity: state.fog,
		fogColor,
		clip,
		waterY: 0,
		time: state.time,
	});
}

function frame(now) {
	const dt = Math.min(0.1, (now - lastT) / 1000);
	lastT = now;
	if (!state.timeFrozen) state.time += dt;

	// 剖切平滑推进（慢慢切掉前半块）
	const speed = state.timelapse ? 2.5 : 0.9;
	state.cutShown += (state.cut - state.cutShown) * Math.min(1, dt * speed);
	if (Math.abs(state.cut - state.cutShown) < 0.0005) state.cutShown = state.cut;
	// 夜间过渡
	state.nightMix += ((state.night ? 1 : 0) - state.nightMix) * Math.min(1, dt * 2.2);

	// 延时：正午 -> 黄昏
	if (state.timelapse) {
		const k = Math.min(1, (now - state.timelapse.t0) / state.timelapse.dur);
		state.sunEl = 55 + (4 - 55) * k;
		$("sun").value = state.sunEl;
		$("sunV").textContent = state.sunEl.toFixed(0) + "°";
		if (k >= 1) stopTimelapse();
	}

	renderFrame();

	frames++;
	if (now - fpsT > 500) {
		$("fps").textContent = Math.round((frames * 1000) / (now - fpsT));
		frames = 0;
		fpsT = now;
		$("az").textContent = Math.round(((state.az * 180) / Math.PI) % 360);
		$("el").textContent = Math.round((state.el * 180) / Math.PI);
	}
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---- 交互：拖动环绕 / 滚轮缩放 ----
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
	dragging = true;
	lastX = e.clientX;
	lastY = e.clientY;
	canvas.classList.add("dragging");
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
	if (!dragging) return;
	state.az -= (e.clientX - lastX) * 0.006;
	state.el += (e.clientY - lastY) * 0.005;
	state.el = Math.min(1.35, Math.max(0.05, state.el));
	lastX = e.clientX;
	lastY = e.clientY;
});
canvas.addEventListener("pointerup", () => {
	dragging = false;
	canvas.classList.remove("dragging");
});
canvas.addEventListener("wheel", (e) => {
	e.preventDefault();
	state.radius *= Math.exp(e.deltaY * 0.0011);
	state.radius = Math.min(60, Math.max(6, state.radius));
}, { passive: false });

// ---- 滑杆与按钮 ----
$("sun").addEventListener("input", (e) => {
	state.sunEl = Number(e.target.value);
	$("sunV").textContent = state.sunEl.toFixed(0) + "°";
});
$("fog").addEventListener("input", (e) => {
	state.fog = Number(e.target.value) / 1000;
	$("fogV").textContent = state.fog.toFixed(3);
});
$("cut").addEventListener("input", (e) => {
	state.cut = Number(e.target.value) / 100;
	$("cutV").textContent = e.target.value + "%";
});
$("night").addEventListener("click", () => {
	state.night = !state.night;
	$("night").classList.toggle("on", state.night);
});
$("reseed").addEventListener("click", () => {
	state.seed = $("seed").value || "ice-7";
	renderer.setSeed(state.seed);
});
$("shot").addEventListener("click", () => {
	canvas.toBlob((blob) => {
		if (!blob) return;
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `ice-cliff-${state.seed}.png`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	}, "image/png");
});

// ---- 延时录制：正午 -> 黄昏，输出 webm ----
function stopTimelapse() {
	const tl = state.timelapse;
	if (!tl) return;
	state.timelapse = null;
	$("timelapse").classList.remove("on");
	if (tl.recorder.state !== "inactive") tl.recorder.stop();
}
$("timelapse").addEventListener("click", () => {
	if (state.timelapse) {
		stopTimelapse();
		return;
	}
	const stream = canvas.captureStream(60);
	const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
		? "video/webm;codecs=vp9"
		: "video/webm";
	const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
	const chunks = [];
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	recorder.onstop = () => {
		const blob = new Blob(chunks, { type: "video/webm" });
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "ice-cliff-noon-to-dusk.webm";
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 10000);
	};
	state.timelapse = { t0: performance.now(), dur: 10000, recorder };
	$("timelapse").classList.add("on");
	recorder.start(250);
});

// ---- 测试钩子 ----
window.__ice = {
	state,
	ready: true,
	setCut(v) { state.cut = v; state.cutShown = v; $("cut").value = v * 100; },
	setSun(v) { state.sunEl = v; },
	setFog(v) { state.fog = v; },
	setNight(b) { state.night = b; state.nightMix = b ? 1 : 0; },
	setSeed(s) { state.seed = s; renderer.setSeed(s); },
	setCamera(azDeg, elDeg, r) {
		state.az = (azDeg * Math.PI) / 180;
		state.el = (elDeg * Math.PI) / 180;
		if (r) state.radius = r;
	},
	freezeTime(b) { state.timeFrozen = b; if (b) state.time = 0; },
	startTimelapse() { $("timelapse").click(); },
	// 同步重绘并读取中心区域像素（测试用，绕过 preserveDrawingBuffer）
	sample(size = 64) {
		renderFrame();
		const gl = renderer.gl;
		const px = new Uint8Array(4 * size * size);
		gl.readPixels(
			Math.round((canvas.width - size) / 2),
			Math.round((canvas.height - size) / 2),
			size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
		return Array.from(px);
	},
};
window.__iceRenderer = renderer;
