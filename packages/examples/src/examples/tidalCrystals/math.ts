/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export const sub = (a: Vec3, b: Vec3): Vec3 => [
	a[0] - b[0],
	a[1] - b[1],
	a[2] - b[2],
];

export const dot = (a: Vec3, b: Vec3): number =>
	a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

export const normalize = (v: Vec3): Vec3 => {
	const length = Math.hypot(v[0], v[1], v[2]) || 1;
	return [v[0] / length, v[1] / length, v[2] / length];
};

export const mixVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

export const perspective = (
	fovY: number,
	aspect: number,
	near: number,
	far: number,
): Mat4 => {
	const f = 1 / Math.tan(fovY / 2);
	const out = new Float32Array(16);
	out[0] = f / aspect;
	out[5] = f;
	out[10] = (far + near) / (near - far);
	out[11] = -1;
	out[14] = (2 * far * near) / (near - far);
	return out;
};

export const lookAt = (eye: Vec3, target: Vec3, up: Vec3): Mat4 => {
	const forward = normalize(sub(target, eye));
	const right = normalize(cross(forward, up));
	const cameraUp = cross(right, forward);
	return new Float32Array([
		right[0],
		cameraUp[0],
		-forward[0],
		0,
		right[1],
		cameraUp[1],
		-forward[1],
		0,
		right[2],
		cameraUp[2],
		-forward[2],
		0,
		-dot(right, eye),
		-dot(cameraUp, eye),
		dot(forward, eye),
		1,
	]);
};

export const multiply = (a: Mat4, b: Mat4): Mat4 => {
	const out = new Float32Array(16);
	for (let column = 0; column < 4; column++) {
		for (let row = 0; row < 4; row++) {
			let value = 0;
			for (let k = 0; k < 4; k++) {
				value += a[k * 4 + row] * b[column * 4 + k];
			}
			out[column * 4 + row] = value;
		}
	}
	return out;
};

export const cameraBasis = (eye: Vec3, target: Vec3, worldUp: Vec3) => {
	const forward = normalize(sub(target, eye));
	const right = normalize(cross(forward, worldUp));
	const up = cross(right, forward);
	return { forward, right, up };
};
