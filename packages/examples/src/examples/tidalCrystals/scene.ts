/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import type { WebGLRenderer } from "melonjs";
import { createCrystalGeometry, createWaterGeometry } from "./geometry";
import type { Vec3 } from "./math";
import type { Palette } from "./palette";
import {
	CRYSTAL_FRAGMENT,
	CRYSTAL_VERTEX,
	SKY_FRAGMENT,
	SKY_VERTEX,
	WATER_FRAGMENT,
	WATER_VERTEX,
} from "./shaders";

export interface TidalFrame {
	viewProj: Float32Array;
	camera: Vec3;
	right: Vec3;
	up: Vec3;
	forward: Vec3;
	tanHalfFov: number;
	aspect: number;
	waterLevel: number;
	tide: number;
	time: number;
	waveSpeed: number;
	palette: Palette;
}

interface ProgramInfo {
	program: WebGLProgram;
	uniforms: Map<string, WebGLUniformLocation | null>;
}

const selectProgram = (
	gl: WebGL2RenderingContext,
	program: WebGLProgram | null,
) => {
	gl.useProgram(program);
};

const compileShader = (
	gl: WebGL2RenderingContext,
	type: number,
	source: string,
	label: string,
): WebGLShader => {
	const shader = gl.createShader(type);
	if (!shader) {
		throw new Error(`Unable to create ${label} shader`);
	}
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const log = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`${label} shader failed to compile:\n${log}`);
	}
	return shader;
};

const createProgram = (
	gl: WebGL2RenderingContext,
	vertexSource: string,
	fragmentSource: string,
	label: string,
): ProgramInfo => {
	const vertex = compileShader(
		gl,
		gl.VERTEX_SHADER,
		vertexSource,
		`${label} vertex`,
	);
	const fragment = compileShader(
		gl,
		gl.FRAGMENT_SHADER,
		fragmentSource,
		`${label} fragment`,
	);
	const program = gl.createProgram();
	if (!program) {
		throw new Error(`Unable to create ${label} program`);
	}
	gl.attachShader(program, vertex);
	gl.attachShader(program, fragment);
	gl.linkProgram(program);
	gl.deleteShader(vertex);
	gl.deleteShader(fragment);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const log = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error(`${label} program failed to link:\n${log}`);
	}
	return { program, uniforms: new Map() };
};

const uniform = (
	gl: WebGL2RenderingContext,
	info: ProgramInfo,
	name: string,
) => {
	if (!info.uniforms.has(name)) {
		info.uniforms.set(name, gl.getUniformLocation(info.program, name));
	}
	return info.uniforms.get(name) ?? null;
};

const setMat4 = (
	gl: WebGL2RenderingContext,
	info: ProgramInfo,
	name: string,
	value: Float32Array,
) => {
	gl.uniformMatrix4fv(uniform(gl, info, name), false, value);
};

const setVec3 = (
	gl: WebGL2RenderingContext,
	info: ProgramInfo,
	name: string,
	value: Vec3,
) => {
	gl.uniform3f(uniform(gl, info, name), value[0], value[1], value[2]);
};

const setFloat = (
	gl: WebGL2RenderingContext,
	info: ProgramInfo,
	name: string,
	value: number,
) => {
	gl.uniform1f(uniform(gl, info, name), value);
};

export class TidalSceneRenderer {
	private readonly sky: ProgramInfo;
	private readonly crystal: ProgramInfo;
	private readonly water: ProgramInfo;
	private readonly skyVao: WebGLVertexArrayObject;
	private readonly crystalVao: WebGLVertexArrayObject;
	private readonly crystalBuffer: WebGLBuffer;
	private readonly crystalCount: number;
	private readonly waterVao: WebGLVertexArrayObject;
	private readonly waterBuffer: WebGLBuffer;
	private readonly waterIndexBuffer: WebGLBuffer;
	private readonly waterIndexCount: number;
	private destroyed = false;

	constructor(private readonly gl: WebGL2RenderingContext) {
		this.sky = createProgram(gl, SKY_VERTEX, SKY_FRAGMENT, "sky");
		this.crystal = createProgram(
			gl,
			CRYSTAL_VERTEX,
			CRYSTAL_FRAGMENT,
			"crystal",
		);
		this.water = createProgram(gl, WATER_VERTEX, WATER_FRAGMENT, "water");

		this.skyVao = this.require(gl.createVertexArray(), "sky vertex array");

		const crystalData = createCrystalGeometry();
		this.crystalCount = crystalData.length / 10;
		this.crystalBuffer = this.require(gl.createBuffer(), "crystal buffer");
		this.crystalVao = this.require(
			gl.createVertexArray(),
			"crystal vertex array",
		);
		gl.bindVertexArray(this.crystalVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.crystalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, crystalData, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
		gl.enableVertexAttribArray(1);
		gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 40, 12);
		gl.enableVertexAttribArray(2);
		gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 40, 24);
		gl.enableVertexAttribArray(3);
		gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);

		const waterData = createWaterGeometry();
		this.waterIndexCount = waterData.indices.length;
		this.waterBuffer = this.require(gl.createBuffer(), "water buffer");
		this.waterIndexBuffer = this.require(
			gl.createBuffer(),
			"water index buffer",
		);
		this.waterVao = this.require(gl.createVertexArray(), "water vertex array");
		gl.bindVertexArray(this.waterVao);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.waterBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, waterData.vertices, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(0);
		gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.waterIndexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, waterData.indices, gl.STATIC_DRAW);
		gl.bindVertexArray(null);
	}

	private require<T>(value: T | null, label: string): T {
		if (!value) {
			throw new Error(`Unable to create ${label}`);
		}
		return value;
	}

	draw(renderer: WebGLRenderer, frame: TidalFrame) {
		const gl = this.gl;
		const previousProgram = renderer.currentProgram;
		gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		gl.clearDepth(1);
		gl.depthMask(true);
		gl.clear(gl.DEPTH_BUFFER_BIT);
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.disable(gl.CULL_FACE);
		gl.disable(gl.BLEND);

		this.drawSky(frame);
		this.drawCrystals(frame);
		this.drawWater(frame);

		gl.bindVertexArray(null);
		selectProgram(gl, previousProgram ?? null);
		renderer.currentProgram = previousProgram;
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
	}

	private drawSky(frame: TidalFrame) {
		const gl = this.gl;
		const info = this.sky;
		selectProgram(gl, info.program);
		gl.bindVertexArray(this.skyVao);
		setVec3(gl, info, "uRight", frame.right);
		setVec3(gl, info, "uUp", frame.up);
		setVec3(gl, info, "uForward", frame.forward);
		setVec3(gl, info, "uSunDir", frame.palette.lightDir);
		setVec3(gl, info, "uSunColor", frame.palette.sunColor);
		setVec3(gl, info, "uSkyTop", frame.palette.skyTop);
		setVec3(gl, info, "uSkyHorizon", frame.palette.skyHorizon);
		setVec3(gl, info, "uFogColor", frame.palette.fogColor);
		setFloat(gl, info, "uTanHalfFov", frame.tanHalfFov);
		setFloat(gl, info, "uAspect", frame.aspect);
		setFloat(gl, info, "uStars", frame.palette.stars);
		setFloat(gl, info, "uTime", frame.time);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	private drawCrystals(frame: TidalFrame) {
		const gl = this.gl;
		const info = this.crystal;
		const palette = frame.palette;
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		selectProgram(gl, info.program);
		gl.bindVertexArray(this.crystalVao);
		setMat4(gl, info, "uViewProj", frame.viewProj);
		setVec3(gl, info, "uCamera", frame.camera);
		setVec3(gl, info, "uLightDir", palette.lightDir);
		setVec3(gl, info, "uSunColor", palette.sunColor);
		setVec3(gl, info, "uRimColor", palette.rimColor);
		setVec3(gl, info, "uCausticColor", palette.causticColor);
		setVec3(gl, info, "uFogColor", palette.fogColor);
		setFloat(gl, info, "uWaterLevel", frame.waterLevel);
		setFloat(gl, info, "uTime", frame.time);
		setFloat(gl, info, "uAmbient", palette.ambient);
		setFloat(gl, info, "uGlow", palette.glow);
		setFloat(gl, info, "uFogNear", palette.fogNear);
		setFloat(gl, info, "uFogFar", palette.fogFar);
		gl.drawArrays(gl.TRIANGLES, 0, this.crystalCount);
	}

	private drawWater(frame: TidalFrame) {
		const gl = this.gl;
		const info = this.water;
		const palette = frame.palette;
		gl.enable(gl.BLEND);
		gl.blendEquation(gl.FUNC_ADD);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		gl.depthMask(false);
		selectProgram(gl, info.program);
		gl.bindVertexArray(this.waterVao);
		setMat4(gl, info, "uViewProj", frame.viewProj);
		setVec3(gl, info, "uCamera", frame.camera);
		setVec3(gl, info, "uLightDir", palette.lightDir);
		setVec3(gl, info, "uSunColor", palette.sunColor);
		setVec3(gl, info, "uCausticColor", palette.causticColor);
		setVec3(gl, info, "uDeepColor", palette.waterDeep);
		setVec3(gl, info, "uShallowColor", palette.waterShallow);
		setVec3(gl, info, "uFogColor", palette.fogColor);
		setFloat(gl, info, "uTime", frame.time);
		setFloat(gl, info, "uTide", frame.tide);
		setFloat(gl, info, "uWaveAmp", 0.72 + frame.tide * 0.42);
		setFloat(gl, info, "uWaveSpeed", frame.waveSpeed);
		setFloat(gl, info, "uWaterLevel", frame.waterLevel);
		setFloat(gl, info, "uFogNear", palette.fogNear);
		setFloat(gl, info, "uFogFar", palette.fogFar);
		gl.drawElements(gl.TRIANGLES, this.waterIndexCount, gl.UNSIGNED_INT, 0);
	}

	destroy() {
		if (this.destroyed) {
			return;
		}
		this.destroyed = true;
		const gl = this.gl;
		for (const info of [this.sky, this.crystal, this.water]) {
			gl.deleteProgram(info.program);
		}
		gl.deleteVertexArray(this.skyVao);
		gl.deleteVertexArray(this.crystalVao);
		gl.deleteVertexArray(this.waterVao);
		gl.deleteBuffer(this.crystalBuffer);
		gl.deleteBuffer(this.waterBuffer);
		gl.deleteBuffer(this.waterIndexBuffer);
	}
}
