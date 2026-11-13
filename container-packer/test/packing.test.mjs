// 装箱算法单元测试：node test/packing.test.mjs
import assert from "node:assert/strict";
import {
	CONTAINER,
	DEFAULT_BOXES,
	pack,
	detectCollisions,
	buildManifest,
} from "../js/packing.js";

const boxes = DEFAULT_BOXES.map((b) => ({ ...b, orientation: "auto" }));

for (const strategy of ["greedy", "volume"]) {
	const r = pack(boxes, CONTAINER, strategy);
	assert.equal(r.unplaced.length, 0, `${strategy}: 应全部装入`);
	assert.equal(r.collisions.length, 0, `${strategy}: 不应有碰撞`);
	assert.equal(r.complete, true, `${strategy}: 应判定完成`);
	assert.equal(r.violations.length, 0, `${strategy}: 自动模式不应产生不可倒置违规`);
	assert.ok(r.utilization > 30 && r.utilization < 100, `${strategy}: 利用率合理`);
	assert.ok(r.cog.x >= 0 && r.cog.x <= CONTAINER.w, "重心在箱内 (x)");
	assert.ok(r.cog.y >= 0 && r.cog.y <= CONTAINER.d, "重心在箱内 (y)");
	assert.ok(r.cog.z >= 0 && r.cog.z <= CONTAINER.h, "重心在箱内 (z)");
	// 每个不可倒置箱子都保持正立
	for (const p of r.placements) {
		if (p.box.keepUp) assert.ok(p.upright, `${p.box.name} 应保持正立`);
	}
	// 清单按层分组
	const manifest = buildManifest(r, CONTAINER);
	assert.match(manifest, /第 1 层/);
	assert.match(manifest, /装箱完成/);
	console.log(`${strategy}: 利用率 ${r.utilization.toFixed(1)}%，${r.placements.length} 箱全部装入`);
}

// 超高箱子（不可倒置，高 300cm > 内高 240cm）必须失败并给出超高原因
const tall = { name: "超高测试箱", w: 100, d: 100, h: 300, weight: 50, keepUp: true, orientation: "auto" };
const r2 = pack([...boxes, tall], CONTAINER, "greedy");
assert.equal(r2.complete, false, "超高箱子不应判定完成");
assert.equal(r2.unplaced.length, 1);
assert.match(r2.failures[0].reason, /超过集装箱内高/, "失败原因应说明超高");
console.log(`超高箱测试：${r2.failures[0].reason}`);

// 可倒置的超高箱子可以横放装入
const tallFlippable = { ...tall, name: "可横放高箱", keepUp: false };
const r3 = pack([tallFlippable], CONTAINER, "greedy");
assert.equal(r3.complete, true, "可倒置箱子应能横放装入");

// 用户手动倒置不可倒置箱子 → 违规计数
const flipped = boxes.map((b) => ({ ...b }));
flipped[0].orientation = 6; // 倒置
const r4 = pack(flipped, CONTAINER, "greedy");
assert.ok(r4.violations.length >= 1, "手动倒置应产生违规");
assert.equal(r4.violations[0].box.keepUp, true);
console.log(`违规检测：${r4.violations.length} 处不可倒置违规`);

// 碰撞检测能发现人为构造的穿模
const bad = [
	{ box: { name: "A" }, x: 0, y: 0, z: 0, w: 100, d: 100, h: 100 },
	{ box: { name: "B" }, x: 50, y: 50, z: 50, w: 100, d: 100, h: 100 },
];
assert.equal(detectCollisions(bad, CONTAINER).length, 1, "应检测出穿模");

console.log("全部单元测试通过 ✓");
