// 程序化几何：冰崖（位移盒体）、内部气泡点云、水面。
// 全部只依赖 seed，同一 seed 输出逐字节相同。

import { hashSeed, mulberry32, fbm3 } from "./rng.js";

export const ICE_BOUNDS = { x: 6, yBot: -2.6, yTop: 4.0, z: 3.4 };

// 某个盒面方向上的位移幅度：正面（+z）最嶙峋，顶部有起伏，底部平缓。
function dispAmp(nx, ny, nz) {
	if (nz > 0.5) return 1.15; // 悬崖正面
	if (ny > 0.5) return 0.55; // 顶面
	if (ny < -0.5) return 0.15; // 底面
	return 0.7; // 侧面
}

function buildFace(axis, sign, seg, seed, pos, idx) {
	const B = ICE_BOUNDS;
	const base = pos.length / 3;
	for (let j = 0; j <= seg; j++) {
		for (let i = 0; i <= seg; i++) {
			const u = (i / seg) * 2 - 1;
			const v = (j / seg) * 2 - 1;
			let x, y, z;
			// 按轴摆放平面
			if (axis === 0) { x = sign * B.x; y = v * (B.yTop - B.yBot) * 0.5 + (B.yTop + B.yBot) * 0.5; z = u * B.z; }
			else if (axis === 1) { x = u * B.x; z = v * B.z; y = sign > 0 ? B.yTop : B.yBot; }
			else { x = u * B.x; y = v * (B.yTop - B.yBot) * 0.5 + (B.yTop + B.yBot) * 0.5; z = sign * B.z; }
			const n = [0, 0, 0];
			n[axis] = sign;
			// 沿法线位移，噪声用世界坐标采样，保证棱边处连续不裂缝
			const d =
				fbm3(x * 0.28 + 7.3, y * 0.28, z * 0.28, 4, seed) *
				dispAmp(n[0], n[1], n[2]);
			// 正面再加一道高频刻痕
			const ridge =
				axis === 2 && sign > 0
					? 0.25 * fbm3(x * 1.1, y * 0.5, z * 1.1, 3, seed + 31)
					: 0;
			pos.push(x + n[0] * d, y + n[1] * d, z + n[2] * (d + ridge));
		}
	}
	for (let j = 0; j < seg; j++) {
		for (let i = 0; i < seg; i++) {
			const a = base + j * (seg + 1) + i;
			const b = a + 1;
			const c = a + seg + 1;
			const d2 = c + 1;
			// 依据实际几何法线选择绕序，保证三角形朝外（各面 u/v 映射不同，不能写死）
			const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
			const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
			const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2];
			const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
			const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
			const nx = e1y * e2z - e1z * e2y;
			const ny = e1z * e2x - e1x * e2z;
			const nz = e1x * e2y - e1y * e2x;
			const out = [0, 0, 0];
			out[axis] = sign;
			if (nx * out[0] + ny * out[1] + nz * out[2] > 0) {
				idx.push(a, b, c, b, d2, c);
			} else {
				idx.push(a, c, b, b, c, d2);
			}
		}
	}
}

export function buildIce(seedStr) {
	const seed = hashSeed(seedStr);
	const pos = [];
	const idx = [];
	buildFace(2, 1, 56, seed, pos, idx); // 正面（悬崖）
	buildFace(2, -1, 24, seed, pos, idx); // 背面
	buildFace(0, 1, 40, seed, pos, idx);
	buildFace(0, -1, 40, seed, pos, idx);
	buildFace(1, 1, 48, seed, pos, idx); // 顶
	buildFace(1, -1, 16, seed, pos, idx); // 底

	const positions = new Float32Array(pos);
	const indices = new Uint32Array(idx);
	const normals = new Float32Array(positions.length);
	for (let t = 0; t < indices.length; t += 3) {
		const ia = indices[t] * 3, ib = indices[t + 1] * 3, ic = indices[t + 2] * 3;
		const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
		const e1x = positions[ib] - ax, e1y = positions[ib + 1] - ay, e1z = positions[ib + 2] - az;
		const e2x = positions[ic] - ax, e2y = positions[ic + 1] - ay, e2z = positions[ic + 2] - az;
		const nx = e1y * e2z - e1z * e2y;
		const ny = e1z * e2x - e1x * e2z;
		const nz = e1x * e2y - e1y * e2x;
		for (const i of [ia, ib, ic]) {
			normals[i] += nx; normals[i + 1] += ny; normals[i + 2] += nz;
		}
	}
	for (let i = 0; i < normals.length; i += 3) {
		const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
		normals[i] /= l; normals[i + 1] /= l; normals[i + 2] /= l;
	}
	return { positions, normals, indices };
}

// 气泡：大部分随机分布，部分沿水平“冻结层”排列
export function buildBubbles(seedStr, count = 1100) {
	const rng = mulberry32(hashSeed(seedStr) ^ 0x9e3779b9);
	const B = ICE_BOUNDS;
	const layers = [];
	for (let i = 0; i < 7; i++) layers.push(B.yBot + 0.5 + rng() * (B.yTop - B.yBot - 1));
	const data = new Float32Array(count * 4); // xyz + size
	let n = 0;
	while (n < count) {
		const x = (rng() * 2 - 1) * (B.x - 0.7);
		let y = B.yBot + 0.4 + rng() * (B.yTop - B.yBot - 0.9);
		const z = (rng() * 2 - 1) * (B.z - 0.7);
		if (rng() < 0.45) y = layers[(rng() * layers.length) | 0] + (rng() - 0.5) * 0.22;
		const size = 0.05 + rng() * rng() * 0.34;
		data[n * 4] = x; data[n * 4 + 1] = y; data[n * 4 + 2] = z; data[n * 4 + 3] = size;
		n++;
	}
	return data;
}

export function buildWater(size = 600, seg = 1) {
	const pos = [];
	const idx = [];
	for (let j = 0; j <= seg; j++) {
		for (let i = 0; i <= seg; i++) {
			pos.push((i / seg - 0.5) * size, 0, (j / seg - 0.5) * size);
		}
	}
	for (let j = 0; j < seg; j++) {
		for (let i = 0; i < seg; i++) {
			const a = j * (seg + 1) + i;
			idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
		}
	}
	return { positions: new Float32Array(pos), indices: new Uint32Array(idx) };
}
