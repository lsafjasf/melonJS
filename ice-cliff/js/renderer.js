// WebGL2 渲染器：编译程序、管理 VAO、按通道绘制场景。

import * as Shaders from "./shaders.js";
import { buildIce, buildBubbles, buildWater } from "./geometry.js";

function compile(gl, type, src) {
	const sh = gl.createShader(type);
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
		throw new Error("shader: " + gl.getShaderInfoLog(sh) + "\n" + src);
	}
	return sh;
}

function program(gl, vs, fs) {
	const p = gl.createProgram();
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
		throw new Error("link: " + gl.getProgramInfoLog(p));
	}
	const uniforms = {};
	const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
	for (let i = 0; i < n; i++) {
		const info = gl.getActiveUniform(p, i);
		uniforms[info.name] = gl.getUniformLocation(p, info.name);
	}
	return { prog: p, u: uniforms };
}

export function createRenderer(canvas) {
	const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
	if (!gl) throw new Error("WebGL2 不可用");

	const sky = program(gl, Shaders.SKY_VS, Shaders.SKY_FS);
	const ice = program(gl, Shaders.ICE_VS, Shaders.ICE_FS);
	const bubble = program(gl, Shaders.BUBBLE_VS, Shaders.BUBBLE_FS);
	const water = program(gl, Shaders.WATER_VS, Shaders.WATER_FS);

	// 天空：无 VBO，靠 gl_VertexID，仍需一个空 VAO
	const skyVao = gl.createVertexArray();

	// 水面
	const w = buildWater();
	const waterVao = gl.createVertexArray();
	gl.bindVertexArray(waterVao);
	const wvb = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, wvb);
	gl.bufferData(gl.ARRAY_BUFFER, w.positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(0);
	gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
	const wib = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wib);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, w.indices, gl.STATIC_DRAW);
	gl.bindVertexArray(null);

	const R = {
		gl,
		programs: { sky, ice, bubble, water },
		iceVao: null, iceCount: 0, iceBuffers: [],
		bubbleVao: null, bubbleCount: 0, bubbleBuffer: null,
		setSeed(seedStr) {
			for (const b of R.iceBuffers) gl.deleteBuffer(b);
			if (R.iceVao) gl.deleteVertexArray(R.iceVao);
			if (R.bubbleVao) gl.deleteVertexArray(R.bubbleVao);
			if (R.bubbleBuffer) gl.deleteBuffer(R.bubbleBuffer);
			R.iceBuffers = [];

			const iceMesh = buildIce(seedStr);
			R.iceVao = gl.createVertexArray();
			gl.bindVertexArray(R.iceVao);
			const vb = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vb);
			gl.bufferData(gl.ARRAY_BUFFER, iceMesh.positions, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
			const nb = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, nb);
			gl.bufferData(gl.ARRAY_BUFFER, iceMesh.normals, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(1);
			gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
			const ib = gl.createBuffer();
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, iceMesh.indices, gl.STATIC_DRAW);
			R.iceCount = iceMesh.indices.length;
			R.iceBuffers.push(vb, nb, ib);

			const bubbles = buildBubbles(seedStr);
			R.bubbleVao = gl.createVertexArray();
			gl.bindVertexArray(R.bubbleVao);
			R.bubbleBuffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, R.bubbleBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, bubbles, gl.STATIC_DRAW);
			gl.enableVertexAttribArray(0);
			gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
			R.bubbleCount = bubbles.length / 4;
			gl.bindVertexArray(null);
		},
		draw(s) {
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.clearColor(0.02, 0.03, 0.05, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

			// 1. 天空
			gl.depthMask(false);
			gl.useProgram(sky.prog);
			gl.bindVertexArray(skyVao);
			gl.uniform3fv(sky.u.uCamRight, s.camRight);
			gl.uniform3fv(sky.u.uCamUp, s.camUp);
			gl.uniform3fv(sky.u.uCamFwd, s.camFwd);
			gl.uniform2f(sky.u.uResolution, canvas.width, canvas.height);
			gl.uniform1f(sky.u.uTanFov, s.tanFov);
			gl.uniform1f(sky.u.uAspect, s.aspect);
			gl.uniform3fv(sky.u.uSunDir, s.sunDir);
			gl.uniform3fv(sky.u.uSunColor, s.sunColor);
			gl.uniform1f(sky.u.uNight, s.night);
			gl.drawArrays(gl.TRIANGLES, 0, 3);

			// 2. 水面（写深度，作为后续透明通道的深度参照）
			gl.depthMask(true);
			gl.useProgram(water.prog);
			gl.bindVertexArray(waterVao);
			gl.uniformMatrix4fv(water.u.uViewProj, false, s.viewProj);
			gl.uniform3fv(water.u.uCamPos, s.camPos);
			gl.uniform3fv(water.u.uSunDir, s.sunDir);
			gl.uniform3fv(water.u.uSunColor, s.sunColor);
			gl.uniform1f(water.u.uNight, s.night);
			gl.uniform1f(water.u.uTime, s.time);
			gl.uniform1f(water.u.uFogDensity, s.fogDensity);
			gl.uniform3fv(water.u.uFogColor, s.fogColor);
			gl.drawElements(gl.TRIANGLES, w.indices.length, gl.UNSIGNED_INT, 0);

			// 3-5. 冰体与气泡：只测深度不写深度，避免自遮挡与剖切时的 z-fighting
			gl.depthMask(false);
			gl.enable(gl.CULL_FACE);

			gl.useProgram(ice.prog);
			gl.bindVertexArray(R.iceVao);
			gl.uniformMatrix4fv(ice.u.uViewProj, false, s.viewProj);
			gl.uniform3fv(ice.u.uCamPos, s.camPos);
			gl.uniform3fv(ice.u.uSunDir, s.sunDir);
			gl.uniform3fv(ice.u.uSunColor, s.sunColor);
			gl.uniform4fv(ice.u.uClip, s.clip);
			gl.uniform1f(ice.u.uNight, s.night);
			gl.uniform1f(ice.u.uWaterY, s.waterY);
			gl.uniform1f(ice.u.uFogDensity, s.fogDensity);
			gl.uniform3fv(ice.u.uFogColor, s.fogColor);
			// 内表面（背面）
			gl.cullFace(gl.FRONT);
			gl.uniform1f(ice.u.uBack, 1);
			gl.drawElements(gl.TRIANGLES, R.iceCount, gl.UNSIGNED_INT, 0);

			// 气泡
			gl.disable(gl.CULL_FACE);
			gl.useProgram(bubble.prog);
			gl.bindVertexArray(R.bubbleVao);
			gl.uniformMatrix4fv(bubble.u.uViewProj, false, s.viewProj);
			gl.uniform3fv(bubble.u.uCamPos, s.camPos);
			gl.uniform4fv(bubble.u.uClip, s.clip);
			gl.uniform3fv(bubble.u.uSunColor, s.sunColor);
			gl.uniform1f(bubble.u.uNight, s.night);
			gl.uniform1f(bubble.u.uFogDensity, s.fogDensity);
			gl.uniform3fv(bubble.u.uFogColor, s.fogColor);
			gl.drawArrays(gl.POINTS, 0, R.bubbleCount);

			// 外表面（正面）
			gl.enable(gl.CULL_FACE);
			gl.cullFace(gl.BACK);
			gl.useProgram(ice.prog);
			gl.bindVertexArray(R.iceVao);
			gl.uniform1f(ice.u.uBack, 0);
			gl.drawElements(gl.TRIANGLES, R.iceCount, gl.UNSIGNED_INT, 0);

			gl.disable(gl.CULL_FACE);
			gl.depthMask(true);
			gl.bindVertexArray(null);
		},
	};
	return R;
}
