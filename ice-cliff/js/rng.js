// 确定性随机与噪声：同一 seed 字符串永远产生同一序列。

export function hashSeed(str) {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export function mulberry32(seed) {
	let a = seed >>> 0;
	return function () {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// 整数格点哈希 -> [0,1)
function hash3(ix, iy, iz, seed) {
	let h = seed >>> 0;
	h = Math.imul(h ^ (ix | 0), 374761393);
	h = Math.imul(h ^ (iy | 0), 668265263);
	h = Math.imul(h ^ (iz | 0), 2246822519);
	h ^= h >>> 13;
	h = Math.imul(h, 1274126177);
	h ^= h >>> 16;
	return (h >>> 0) / 4294967296;
}

function smooth(t) {
	return t * t * (3 - 2 * t);
}

// 三维值噪声，返回值 [-1,1]
export function noise3(x, y, z, seed) {
	const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
	const tx = smooth(x - x0), ty = smooth(y - y0), tz = smooth(z - z0);
	let acc = 0;
	for (let dz = 0; dz <= 1; dz++) {
		for (let dy = 0; dy <= 1; dy++) {
			for (let dx = 0; dx <= 1; dx++) {
				const w =
					(dx ? tx : 1 - tx) * (dy ? ty : 1 - ty) * (dz ? tz : 1 - tz);
				acc += w * hash3(x0 + dx, y0 + dy, z0 + dz, seed);
			}
		}
	}
	return acc * 2 - 1;
}

// 分形噪声，返回大致 [-1,1]
export function fbm3(x, y, z, octaves, seed) {
	let sum = 0;
	let amp = 0.5;
	let freq = 1;
	let norm = 0;
	for (let i = 0; i < octaves; i++) {
		sum += amp * noise3(x * freq, y * freq, z * freq, seed + i * 101);
		norm += amp;
		amp *= 0.5;
		freq *= 2.03;
	}
	return sum / norm;
}
