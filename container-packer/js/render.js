// 等距投影渲染器：绘制集装箱线框 / 半透明侧壁与箱体的三个可见面。
// 支持绕竖直轴旋转视角（yaw）与"剖开侧壁"（隐藏朝向观察者的两侧壁板）。

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

const PALETTE = [
	"#e07a5f", "#3d8bfd", "#81b29a", "#f2cc8f", "#9b5de5", "#00b4d8",
	"#ef476f", "#8ac926", "#ff9770", "#6a4c93", "#43aa8b", "#f9c74f",
	"#577590", "#e76f51",
];

function shade(hex, factor) {
	const n = parseInt(hex.slice(1), 16);
	const r = Math.min(255, Math.round(((n >> 16) & 255) * factor));
	const g = Math.min(255, Math.round(((n >> 8) & 255) * factor));
	const b = Math.min(255, Math.round((n & 255) * factor));
	return `rgb(${r},${g},${b})`;
}

export function createView(canvas) {
	const ctx = canvas.getContext("2d");
	let yaw = Math.PI / 4;
	let cutaway = false;
	let state = { container: null, placements: [], violations: [] };

	function projectFactory(scale, ox, oy) {
		const cosY = Math.cos(yaw);
		const sinY = Math.sin(yaw);
		return (x, y, z) => {
			const rx = x * cosY - y * sinY;
			const ry = x * sinY + y * cosY;
			return [ox + (rx - ry) * COS30 * scale, oy + (rx + ry) * SIN30 * scale - z * scale];
		};
	}

	function polygon(points, fill, stroke) {
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
		ctx.closePath();
		if (fill) {
			ctx.fillStyle = fill;
			ctx.fill();
		}
		if (stroke) {
			ctx.strokeStyle = stroke;
			ctx.stroke();
		}
	}

	// 旋转后的世界法线
	function rotatedNormal(nx, ny) {
		const cosY = Math.cos(yaw);
		const sinY = Math.sin(yaw);
		return [nx * cosY - ny * sinY, nx * sinY + ny * cosY];
	}

	function drawBox(project, p, color, violated) {
		const c = [
			project(p.x, p.y, p.z),
			project(p.x + p.w, p.y, p.z),
			project(p.x + p.w, p.y + p.d, p.z),
			project(p.x, p.y + p.d, p.z),
			project(p.x, p.y, p.z + p.h),
			project(p.x + p.w, p.y, p.z + p.h),
			project(p.x + p.w, p.y + p.d, p.z + p.h),
			project(p.x, p.y + p.d, p.z + p.h),
		];
		const edge = violated ? "#d00000" : "rgba(30,30,30,0.55)";
		// 顶面始终可见
		polygon([c[4], c[5], c[6], c[7]], shade(color, 1.15), edge);
		// 四个侧面，仅画法线朝向观察者的面
		const sides = [
			{ idx: [0, 1, 5, 4], n: rotatedNormal(0, -1) },
			{ idx: [1, 2, 6, 5], n: rotatedNormal(1, 0) },
			{ idx: [2, 3, 7, 6], n: rotatedNormal(0, 1) },
			{ idx: [3, 0, 4, 7], n: rotatedNormal(-1, 0) },
		];
		for (const s of sides) {
			if (s.n[0] + s.n[1] > 1e-9) {
				polygon(s.idx.map((i) => c[i]), shade(color, 0.8), edge);
			}
		}
		if (violated) {
			ctx.save();
			ctx.lineWidth = 2.5;
			ctx.strokeStyle = "#d00000";
			polygon([c[4], c[5], c[6], c[7]], null, "#d00000");
			ctx.restore();
		}
		// 标签
		const top = [
			(c[4][0] + c[6][0]) / 2,
			(c[4][1] + c[6][1]) / 2,
		];
		ctx.fillStyle = violated ? "#d00000" : "#1d3557";
		ctx.font = "11px sans-serif";
		ctx.textAlign = "center";
		const label = p.box.keepUp ? `↑ ${p.box.name}` : p.box.name;
		ctx.fillText(label, top[0], top[1] - 2);
	}

	function wallList(project, container) {
		const { w, d, h } = container;
		const v = (x, y, z) => project(x, y, z);
		return [
			{ pts: [v(0, 0, 0), v(w, 0, 0), v(w, 0, h), v(0, 0, h)], n: rotatedNormal(0, -1) },
			{ pts: [v(w, 0, 0), v(w, d, 0), v(w, d, h), v(w, 0, h)], n: rotatedNormal(1, 0) },
			{ pts: [v(w, d, 0), v(0, d, 0), v(0, d, h), v(w, d, h)], n: rotatedNormal(0, 1) },
			{ pts: [v(0, d, 0), v(0, 0, 0), v(0, 0, h), v(0, d, h)], n: rotatedNormal(-1, 0) },
		];
	}

	function drawWalls(project, container, near) {
		for (const wall of wallList(project, container)) {
			const facing = wall.n[0] + wall.n[1] > 1e-9;
			if (facing === near) {
				polygon(wall.pts, facing ? "rgba(150,170,200,0.10)" : "rgba(150,170,200,0.22)", null);
			}
		}
	}

	function drawFloor(project, container) {
		const { w, d } = container;
		const v = (x, y, z) => project(x, y, z);
		polygon([v(0, 0, 0), v(w, 0, 0), v(w, d, 0), v(0, d, 0)], "rgba(120,120,120,0.18)", null);
		ctx.strokeStyle = "rgba(0,0,0,0.08)";
		for (let gx = 50; gx < w; gx += 50) {
			ctx.beginPath();
			ctx.moveTo(...v(gx, 0, 0));
			ctx.lineTo(...v(gx, d, 0));
			ctx.stroke();
		}
		for (let gy = 50; gy < d; gy += 50) {
			ctx.beginPath();
			ctx.moveTo(...v(0, gy, 0));
			ctx.lineTo(...v(w, gy, 0));
			ctx.stroke();
		}
	}

	function drawFrame(project, container) {
		const { w, d, h } = container;
		const v = (x, y, z) => project(x, y, z);
		ctx.strokeStyle = "rgba(40,40,40,0.7)";
		ctx.lineWidth = 1.2;
		const corners = [v(0, 0, 0), v(w, 0, 0), v(w, d, 0), v(0, d, 0)];
		const tops = [v(0, 0, h), v(w, 0, h), v(w, d, h), v(0, d, h)];
		for (let i = 0; i < 4; i++) {
			const j = (i + 1) % 4;
			ctx.beginPath();
			ctx.moveTo(...corners[i]);
			ctx.lineTo(...corners[j]);
			ctx.moveTo(...tops[i]);
			ctx.lineTo(...tops[j]);
			ctx.moveTo(...corners[i]);
			ctx.lineTo(...tops[i]);
			ctx.stroke();
		}
		ctx.lineWidth = 1;
	}

	function draw(newState) {
		if (newState) state = newState;
		const { container, placements, violations } = state;
		const dpr = window.devicePixelRatio || 1;
		const cw = canvas.clientWidth;
		const ch = canvas.clientHeight;
		if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
			canvas.width = cw * dpr;
			canvas.height = ch * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, cw, ch);
		if (!container) return;

		// 依据集装箱八个角点的投影范围自适应缩放
		const probe = projectFactory(1, 0, 0);
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const x of [0, container.w]) {
			for (const y of [0, container.d]) {
				for (const z of [0, container.h]) {
					const [sx, sy] = probe(x, y, z);
					minX = Math.min(minX, sx);
					maxX = Math.max(maxX, sx);
					minY = Math.min(minY, sy);
					maxY = Math.max(maxY, sy);
				}
			}
		}
		const margin = 40;
		const scale = Math.min((cw - margin * 2) / (maxX - minX), (ch - margin * 2) / (maxY - minY));
		const ox = (cw - (maxX - minX) * scale) / 2 - minX * scale;
		const oy = (ch - (maxY - minY) * scale) / 2 - minY * scale;
		const project = projectFactory(scale, ox, oy);

		drawFloor(project, container);
		drawWalls(project, container, false);

		// 按旋转后的深度（rx+ry 中心）从远到近绘制
		const cosY = Math.cos(yaw);
		const sinY = Math.sin(yaw);
		const sorted = [...placements].sort((a, b) => {
			const da = (a.x + a.w / 2) * cosY - (a.y + a.d / 2) * sinY + ((a.x + a.w / 2) * sinY + (a.y + a.d / 2) * cosY);
			const db = (b.x + b.w / 2) * cosY - (b.y + b.d / 2) * sinY + ((b.x + b.w / 2) * sinY + (b.y + b.d / 2) * cosY);
			return da - db;
		});
		sorted.forEach((p, i) => {
			const violated = violations.includes(p);
			drawBox(project, p, PALETTE[i % PALETTE.length], violated);
		});

		if (!cutaway) {
			drawWalls(project, container, true);
		}
		drawFrame(project, container);

		// 重心标记
		if (state.cog) {
			const [gx, gy] = project(state.cog.x, state.cog.y, state.cog.z);
			ctx.strokeStyle = "#d00000";
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.arc(gx, gy, 6, 0, Math.PI * 2);
			ctx.moveTo(gx - 10, gy);
			ctx.lineTo(gx + 10, gy);
			ctx.moveTo(gx, gy - 10);
			ctx.lineTo(gx, gy + 10);
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.fillStyle = "#d00000";
			ctx.font = "11px sans-serif";
			ctx.textAlign = "left";
			ctx.fillText("重心", gx + 12, gy - 8);
		}
	}

	return {
		draw,
		rotateBy(delta) {
			yaw += delta;
			draw();
		},
		setCutaway(value) {
			cutaway = value;
			draw();
		},
		getYaw: () => yaw,
	};
}
