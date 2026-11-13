import { CONTAINER, DEFAULT_BOXES, ORIENTATIONS, pack, buildManifest } from "./packing.js";
import { createView } from "./render.js";

const canvas = document.getElementById("view");
const view = createView(canvas);

let nextId = 1;
const boxes = DEFAULT_BOXES.map((b) => ({ ...b, id: nextId++, orientation: "auto" }));
let result = null;

const $ = (id) => document.getElementById(id);

function currentState() {
	return {
		container: CONTAINER,
		placements: result ? result.placements : [],
		violations: result ? result.violations : [],
		cog: result ? result.cog : null,
	};
}

function redraw() {
	view.draw(currentState());
}

function renderBoxList() {
	const tbody = $("boxRows");
	tbody.innerHTML = "";
	boxes.forEach((box, i) => {
		const tr = document.createElement("tr");
		const options = [`<option value="auto">自动</option>`]
			.concat(ORIENTATIONS.map((o) => `<option value="${o.key}">${o.label}</option>`))
			.map((html) =>
				html.replace(`value="${box.orientation}"`, `value="${box.orientation}" selected`),
			)
			.join("");
		tr.innerHTML = `
			<td>${i + 1}. ${box.name}${box.keepUp ? ' <span title="不可倒置">↑</span>' : ""}</td>
			<td>${box.w}×${box.d}×${box.h}</td>
			<td>${box.weight}</td>
			<td><select data-id="${box.id}" class="orient">${options}</select></td>
			<td class="rowBtns">
				<button data-act="up" data-id="${box.id}" ${i === 0 ? "disabled" : ""}>↑</button>
				<button data-act="down" data-id="${box.id}" ${i === boxes.length - 1 ? "disabled" : ""}>↓</button>
				<button data-act="del" data-id="${box.id}">✕</button>
			</td>`;
		tbody.appendChild(tr);
	});
	$("boxCount").textContent = String(boxes.length);
}

$("boxRows").addEventListener("change", (e) => {
	if (!e.target.classList.contains("orient")) return;
	const box = boxes.find((b) => b.id === Number(e.target.dataset.id));
	box.orientation = e.target.value === "auto" ? "auto" : Number(e.target.value);
});

$("boxRows").addEventListener("click", (e) => {
	const act = e.target.dataset.act;
	if (!act) return;
	const idx = boxes.findIndex((b) => b.id === Number(e.target.dataset.id));
	if (act === "del") boxes.splice(idx, 1);
	if (act === "up" && idx > 0) [boxes[idx - 1], boxes[idx]] = [boxes[idx], boxes[idx - 1]];
	if (act === "down" && idx < boxes.length - 1) [boxes[idx + 1], boxes[idx]] = [boxes[idx], boxes[idx + 1]];
	renderBoxList();
});

$("addBox").addEventListener("submit", (e) => {
	e.preventDefault();
	const box = {
		id: nextId++,
		name: $("fName").value.trim() || `箱子${nextId}`,
		w: Number($("fW").value),
		d: Number($("fD").value),
		h: Number($("fH").value),
		weight: Number($("fWeight").value),
		keepUp: $("fKeepUp").checked,
		orientation: "auto",
	};
	if (!(box.w > 0 && box.d > 0 && box.h > 0) || !(box.weight >= 0)) return;
	boxes.push(box);
	e.target.reset();
	renderBoxList();
});

function strategy() {
	return document.querySelector('input[name="strategy"]:checked').value;
}

function renderMetrics() {
	const el = $("metrics");
	if (!result) {
		el.innerHTML = "<p>尚未装箱。点击「开始自动排布」。</p>";
		$("status").textContent = "";
		$("status").className = "";
		$("exportBtn").disabled = true;
		return;
	}
	const cog = result.cog
		? `x=${result.cog.x.toFixed(1)}cm，y=${result.cog.y.toFixed(1)}cm，z=${result.cog.z.toFixed(1)}cm` +
			`（长向 ${((result.cog.x / CONTAINER.w) * 100).toFixed(0)}%，宽向 ${((result.cog.y / CONTAINER.d) * 100).toFixed(0)}%，高向 ${((result.cog.z / CONTAINER.h) * 100).toFixed(0)}%）`
		: "—";
	el.innerHTML = `
		<p><strong>容积利用率：</strong>${result.utilization.toFixed(1)}%
			（${(result.usedVolume / 1e6).toFixed(2)} / ${(result.containerVolume / 1e6).toFixed(2)} m³）</p>
		<p><strong>重心位置：</strong>${cog}</p>
		<p><strong>总重量：</strong>${result.totalWeight}kg</p>
		<p class="${result.violations.length ? "bad" : ""}"><strong>不可倒置违规：</strong>${result.violations.length} 处
			${result.violations.map((p) => `「${p.box.name}」当前朝向：${p.orientation}`).join("，")}</p>`;

	const status = $("status");
	if (result.complete) {
		status.textContent = "✓ 装箱完成：碰撞检测通过，全部箱子已装入。";
		status.className = "ok";
	} else {
		const msgs = [];
		if (result.collisions.length) msgs.push(`碰撞检测未通过：${result.collisions.join("；")}`);
		for (const f of result.failures) msgs.push(`「${f.box.name}」无法装入（${f.reason}）`);
		status.textContent = `✗ 装箱未完成：${msgs.join("；")}`;
		status.className = "bad";
	}
	$("exportBtn").disabled = !result.complete;
}

$("packBtn").addEventListener("click", () => {
	result = pack(boxes, CONTAINER, strategy());
	renderMetrics();
	redraw();
});

$("exportBtn").addEventListener("click", () => {
	if (!result || !result.complete) return;
	const text = buildManifest(result, CONTAINER);
	const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = "装箱清单.txt";
	a.click();
	URL.revokeObjectURL(a.href);
});

$("resetBtn").addEventListener("click", () => {
	boxes.length = 0;
	for (const b of DEFAULT_BOXES) boxes.push({ ...b, id: nextId++, orientation: "auto" });
	result = null;
	renderBoxList();
	renderMetrics();
	redraw();
});

// 视角控制
$("rotL").addEventListener("click", () => view.rotateBy(-Math.PI / 4));
$("rotR").addEventListener("click", () => view.rotateBy(Math.PI / 4));
$("cutaway").addEventListener("change", (e) => view.setCutaway(e.target.checked));

let dragging = false;
let lastX = 0;
canvas.addEventListener("pointerdown", (e) => {
	dragging = true;
	lastX = e.clientX;
	canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
	if (!dragging) return;
	view.rotateBy((e.clientX - lastX) * 0.01);
	lastX = e.clientX;
});
canvas.addEventListener("pointerup", () => {
	dragging = false;
});

window.addEventListener("resize", redraw);

renderBoxList();
renderMetrics();
redraw();

// 供自动化测试读取
window.__app = {
	boxes,
	getResult: () => result,
	pack: (s) => {
		result = pack(boxes, CONTAINER, s || strategy());
		renderMetrics();
		redraw();
		return result;
	},
	manifest: () => (result ? buildManifest(result, CONTAINER) : null),
};
