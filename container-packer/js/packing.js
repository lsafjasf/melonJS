// 装箱核心算法：纯逻辑模块，浏览器与 Node 测试共用。

export const CONTAINER = {
	name: "20英尺标准集装箱（内尺寸）",
	w: 590, // 长，cm
	d: 235, // 宽，cm
	h: 240, // 高，cm
};

// 8 种朝向。upright 表示箱子原始的"上"仍然朝上；
// 带 keepUp（不可倒置）标记的箱子在自动模式下只允许 upright 的朝向。
export const ORIENTATIONS = [
	{ key: 0, label: "正常", dims: (b) => [b.w, b.d, b.h], upright: true },
	{ key: 1, label: "水平旋转90°", dims: (b) => [b.d, b.w, b.h], upright: true },
	{ key: 2, label: "侧放（前倒）", dims: (b) => [b.w, b.h, b.d], upright: false },
	{ key: 3, label: "侧放（右倒）", dims: (b) => [b.h, b.d, b.w], upright: false },
	{ key: 4, label: "侧放（后倒）", dims: (b) => [b.d, b.h, b.w], upright: false },
	{ key: 5, label: "侧放（左倒）", dims: (b) => [b.h, b.w, b.d], upright: false },
	{ key: 6, label: "倒置", dims: (b) => [b.w, b.d, b.h], upright: false, flipped: true },
	{ key: 7, label: "倒置旋转90°", dims: (b) => [b.d, b.w, b.h], upright: false, flipped: true },
];

export const DEFAULT_BOXES = [
	{ name: "大型电机柜", w: 200, d: 120, h: 180, weight: 480, keepUp: true },
	{ name: "控制柜", w: 120, d: 80, h: 200, weight: 260, keepUp: true },
	{ name: "空压机", w: 150, d: 100, h: 120, weight: 320, keepUp: true },
	{ name: "电缆盘", w: 120, d: 120, h: 80, weight: 200, keepUp: true },
	{ name: "精密仪器箱", w: 60, d: 50, h: 50, weight: 35, keepUp: true },
	{ name: "包装件", w: 140, d: 90, h: 70, weight: 80, keepUp: false },
	{ name: "管件箱", w: 180, d: 60, h: 60, weight: 90, keepUp: false },
	{ name: "泵体箱", w: 100, d: 80, h: 90, weight: 150, keepUp: false },
	{ name: "工具箱", w: 100, d: 50, h: 50, weight: 45, keepUp: false },
	{ name: "阀门箱", w: 80, d: 60, h: 60, weight: 70, keepUp: false },
	{ name: "备件箱A", w: 90, d: 70, h: 60, weight: 55, keepUp: false },
	{ name: "备件箱B", w: 90, d: 70, h: 60, weight: 60, keepUp: false },
];

export function boxVolume(box) {
	return box.w * box.d * box.h;
}

// 箱子在某种朝向下能否放进一个 w×d×h 的空间
function fits(dims, space) {
	return dims[0] <= space.w && dims[1] <= space.d && dims[2] <= space.h;
}

function allowedOrientations(box) {
	if (box.orientation !== undefined && box.orientation !== "auto") {
		return [ORIENTATIONS[box.orientation]];
	}
	if (box.keepUp) {
		return ORIENTATIONS.filter((o) => o.upright);
	}
	return ORIENTATIONS.filter((o) => !o.flipped);
}

// 从自由空间列表中剔除被完全包含的空间
function pruneSpaces(spaces) {
	return spaces.filter(
		(a, i) =>
			!spaces.some(
				(b, j) =>
					i !== j &&
					a.x >= b.x &&
					a.y >= b.y &&
					a.z >= b.z &&
					a.x + a.w <= b.x + b.w &&
					a.y + a.d <= b.y + b.d &&
					a.z + a.h <= b.z + b.h,
			),
	);
}

// 贪心首次适配：按给定顺序，把每个箱子放进"最低、最后、最左"的第一个可容空间，
// 然后对该空间做 guillotine 切分（右、前、上三块残余空间）。
function firstFit(ordered, container) {
	let spaces = [{ x: 0, y: 0, z: 0, w: container.w, d: container.d, h: container.h }];
	const placements = [];
	const unplaced = [];

	for (const box of ordered) {
		const orientations = allowedOrientations(box);
		spaces.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
		let chosen = null;
		for (const space of spaces) {
			for (const orient of orientations) {
				const dims = orient.dims(box);
				if (fits(dims, space)) {
					chosen = { space, orient, dims };
					break;
				}
			}
			if (chosen) break;
		}
		if (!chosen) {
			unplaced.push(box);
			continue;
		}
		const { space, orient, dims } = chosen;
		placements.push({
			box,
			x: space.x,
			y: space.y,
			z: space.z,
			w: dims[0],
			d: dims[1],
			h: dims[2],
			orientation: orient.label,
			upright: orient.upright,
		});
		spaces = spaces.filter((s) => s !== space);
		const residuals = [
			{ x: space.x + dims[0], y: space.y, z: space.z, w: space.w - dims[0], d: space.d, h: space.h },
			{ x: space.x, y: space.y + dims[1], z: space.z, w: dims[0], d: space.d - dims[1], h: space.h },
			{ x: space.x, y: space.y, z: space.z + dims[2], w: dims[0], d: dims[1], h: space.h - dims[2] },
		];
		for (const r of residuals) {
			if (r.w > 0 && r.d > 0 && r.h > 0) spaces.push(r);
		}
		spaces = pruneSpaces(spaces);
	}
	return { placements, unplaced };
}

// 碰撞检测：两两 AABB 相交 + 集装箱边界检查。返回问题列表（空数组 = 通过）。
export function detectCollisions(placements, container) {
	const problems = [];
	for (const p of placements) {
		if (
			p.x < 0 ||
			p.y < 0 ||
			p.z < 0 ||
			p.x + p.w > container.w ||
			p.y + p.d > container.d ||
			p.z + p.h > container.h
		) {
			problems.push(`箱子「${p.box.name}」超出集装箱边界`);
		}
	}
	for (let i = 0; i < placements.length; i++) {
		for (let j = i + 1; j < placements.length; j++) {
			const a = placements[i];
			const b = placements[j];
			const overlap =
				a.x < b.x + b.w &&
				b.x < a.x + a.w &&
				a.y < b.y + b.d &&
				b.y < a.y + a.d &&
				a.z < b.z + b.h &&
				b.z < a.z + a.h;
			if (overlap) {
				problems.push(`箱子「${a.box.name}」与「${b.box.name}」发生穿模`);
			}
		}
	}
	return problems;
}

function unplacedReason(box, container) {
	const fitsEmpty = allowedOrientations(box).some((o) => {
		const dims = o.dims(box);
		return fits(dims, container);
	});
	if (fitsEmpty) return "剩余空间不足";
	if (box.keepUp && box.h > container.h) {
		return `高度 ${box.h}cm 超过集装箱内高 ${container.h}cm（不可倒置，不能横放）`;
	}
	return `尺寸 ${box.w}×${box.d}×${box.h}cm 超过集装箱内尺寸 ${container.w}×${container.d}×${container.h}cm`;
}

// 主入口。strategy: "greedy"（按列表顺序贪心）或 "volume"（按体积降序）。
export function pack(boxes, container, strategy) {
	const ordered =
		strategy === "volume"
			? boxes
					.map((box, i) => ({ box, i }))
					.sort((a, b) => boxVolume(b.box) - boxVolume(a.box) || a.i - b.i)
					.map((e) => e.box)
			: [...boxes];

	const { placements, unplaced } = firstFit(ordered, container);
	const collisions = detectCollisions(placements, container);

	const containerVolume = container.w * container.d * container.h;
	const usedVolume = placements.reduce((sum, p) => sum + p.w * p.d * p.h, 0);
	const utilization = (usedVolume / containerVolume) * 100;

	let cog = null;
	const totalWeight = placements.reduce((sum, p) => sum + p.box.weight, 0);
	if (totalWeight > 0) {
		cog = { x: 0, y: 0, z: 0 };
		for (const p of placements) {
			cog.x += (p.box.weight * (p.x + p.w / 2)) / totalWeight;
			cog.y += (p.box.weight * (p.y + p.d / 2)) / totalWeight;
			cog.z += (p.box.weight * (p.z + p.h / 2)) / totalWeight;
		}
	}

	const violations = placements.filter((p) => p.box.keepUp && !p.upright);
	const failures = unplaced.map((box) => ({ box, reason: unplacedReason(box, container) }));
	const complete = unplaced.length === 0 && collisions.length === 0;

	return {
		strategy,
		placements,
		unplaced,
		failures,
		collisions,
		utilization,
		usedVolume,
		containerVolume,
		cog,
		totalWeight,
		violations,
		complete,
	};
}

// 按层（底面高度 z）分组的装箱清单
export function buildManifest(result, container) {
	const lines = [];
	lines.push("集装箱装箱清单");
	lines.push(`集装箱：${container.name} ${container.w}×${container.d}×${container.h}cm`);
	lines.push(`策略：${result.strategy === "volume" ? "按体积降序" : "贪心（列表顺序）"}`);
	lines.push(`状态：${result.complete ? "装箱完成" : "装箱未完成"}`);
	lines.push(
		`容积利用率：${result.utilization.toFixed(1)}%（${(result.usedVolume / 1e6).toFixed(2)} / ${(result.containerVolume / 1e6).toFixed(2)} m³）`,
	);
	lines.push(`总重量：${result.totalWeight}kg`);
	if (result.cog) {
		lines.push(
			`重心位置：x=${result.cog.x.toFixed(1)}cm y=${result.cog.y.toFixed(1)}cm z=${result.cog.z.toFixed(1)}cm`,
		);
	}
	lines.push(`不可倒置违规：${result.violations.length} 处`);
	if (result.collisions.length > 0) {
		lines.push(`碰撞检测未通过：${result.collisions.join("；")}`);
	}
	if (result.failures.length > 0) {
		lines.push("未能装入的箱子：");
		for (const f of result.failures) {
			lines.push(`  - ${f.box.name}（${f.reason}）`);
		}
	}
	lines.push("");

	const layers = new Map();
	for (const p of result.placements) {
		if (!layers.has(p.z)) layers.set(p.z, []);
		layers.get(p.z).push(p);
	}
	const zs = [...layers.keys()].sort((a, b) => a - b);
	zs.forEach((z, idx) => {
		lines.push(`第 ${idx + 1} 层（底面高度 z=${z}cm）`);
		for (const p of layers.get(z)) {
			const warn = p.box.keepUp && !p.upright ? "  ⚠ 不可倒置违规" : "";
			lines.push(
				`  - ${p.box.name} | ${p.w}×${p.d}×${p.h}cm | 位置(${p.x}, ${p.y}, ${p.z}) | ${p.box.weight}kg | 朝向：${p.orientation}${p.box.keepUp ? " | 不可倒置" : ""}${warn}`,
			);
		}
		lines.push("");
	});
	return lines.join("\n");
}
