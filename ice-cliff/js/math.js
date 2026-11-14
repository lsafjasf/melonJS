// 最小矩阵/向量工具（列主序 mat4，与 WebGL 一致）。

export function perspective(fovy, aspect, near, far) {
	const f = 1 / Math.tan(fovy / 2);
	const nf = 1 / (near - far);
	return new Float32Array([
		f / aspect, 0, 0, 0,
		0, f, 0, 0,
		0, 0, (far + near) * nf, -1,
		0, 0, 2 * far * near * nf, 0,
	]);
}

export function lookAt(eye, center, up) {
	let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
	let len = Math.hypot(zx, zy, zz);
	zx /= len; zy /= len; zz /= len;
	let xx = up[1] * zz - up[2] * zy;
	let xy = up[2] * zx - up[0] * zz;
	let xz = up[0] * zy - up[1] * zx;
	len = Math.hypot(xx, xy, xz) || 1;
	xx /= len; xy /= len; xz /= len;
	const yx = zy * xz - zz * xy;
	const yy = zz * xx - zx * xz;
	const yz = zx * xy - zy * xx;
	return new Float32Array([
		xx, yx, zx, 0,
		xy, yy, zy, 0,
		xz, yz, zz, 0,
		-(xx * eye[0] + xy * eye[1] + xz * eye[2]),
		-(yx * eye[0] + yy * eye[1] + yz * eye[2]),
		-(zx * eye[0] + zy * eye[1] + zz * eye[2]),
		1,
	]);
}

export function multiply(a, b) {
	const out = new Float32Array(16);
	for (let c = 0; c < 4; c++) {
		for (let r = 0; r < 4; r++) {
			out[c * 4 + r] =
				a[r] * b[c * 4] +
				a[4 + r] * b[c * 4 + 1] +
				a[8 + r] * b[c * 4 + 2] +
				a[12 + r] * b[c * 4 + 3];
		}
	}
	return out;
}

// 由视图矩阵取相机位置（view 的逆平移）
export function camPosFromView(v) {
	const x = v[0], y = v[4], z = v[8];
	const x2 = v[1], y2 = v[5], z2 = v[9];
	const x3 = v[2], y3 = v[6], z3 = v[10];
	const tx = v[12], ty = v[13], tz = v[14];
	return [
		-(x * tx + x2 * ty + x3 * tz),
		-(y * tx + y2 * ty + y3 * tz),
		-(z * tx + z2 * ty + z3 * tz),
	];
}

export function normalize3(v) {
	const l = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / l, v[1] / l, v[2] / l];
}
