// 全部着色器源码（GLSL ES 3.00）。无贴图，霜纹/水波/星空均为程序噪声。

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
		f.z);
}
float fbm(vec3 p) {
	float s = 0.0;
	float a = 0.5;
	for (int i = 0; i < 4; i++) {
		s += a * vnoise(p);
		p *= 2.03;
		a *= 0.5;
	}
	return s;
}
`;

const FOG_GLSL = /* glsl */ `
uniform float uFogDensity;
uniform vec3 uFogColor;
vec3 applyFog(vec3 col, float dist) {
	float f = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
	return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}
`;

export const SKY_VS = /* glsl */ `#version 300 es
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.9999, 1.0);
}
`;

export const SKY_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec3 uCamRight, uCamUp, uCamFwd;
uniform vec2 uResolution;
uniform float uTanFov, uAspect;
uniform vec3 uSunDir, uSunColor;
uniform float uNight;
out vec4 outColor;
${NOISE_GLSL}
void main() {
	vec2 ndc = vec2(
		(gl_FragCoord.x / uResolution.x) * 2.0 - 1.0,
		(gl_FragCoord.y / uResolution.y) * 2.0 - 1.0);
	vec3 ray = normalize(uCamFwd + uCamRight * ndc.x * uTanFov * uAspect + uCamUp * ndc.y * uTanFov);
	float h = clamp(ray.y, -1.0, 1.0);
	// 白天渐变
	vec3 zenith = mix(vec3(0.10, 0.26, 0.52), vec3(0.04, 0.08, 0.18), uNight);
	vec3 horizon = mix(uSunColor * 0.5 + vec3(0.16, 0.22, 0.32), vec3(0.05, 0.08, 0.14), uNight);
	vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6));
	col = mix(col, horizon * 0.6, clamp(-h * 2.0, 0.0, 1.0));
	// 太阳/月亮光晕
	float sd = max(dot(ray, uSunDir), 0.0);
	col += uSunColor * (pow(sd, 350.0) * 3.0 + pow(sd, 24.0) * 0.35) * (1.0 - uNight * 0.55);
	col += vec3(0.75, 0.82, 0.95) * pow(sd, 900.0) * uNight * 2.0;
	// 星空
	if (uNight > 0.01 && ray.y > 0.0) {
		vec3 sp = floor(ray * 220.0);
		float star = step(0.9985, hash13(sp));
		float tw = 0.6 + 0.4 * hash13(sp + 7.7);
		col += vec3(star) * tw * uNight * smoothstep(0.0, 0.25, ray.y);
	}
	outColor = vec4(col, 1.0);
}
`;

export const ICE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
uniform mat4 uViewProj;
out vec3 vWorld;
out vec3 vNormal;
void main() {
	vWorld = aPos;
	vNormal = aNormal;
	gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

// uBack = 1 时绘制内表面（法线翻转、颜色更深），剖切后能看到冰体内部
export const ICE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform vec3 uSunDir, uSunColor;
uniform vec4 uClip;
uniform float uNight;
uniform float uBack;
uniform float uWaterY;
out vec4 outColor;
${NOISE_GLSL}
${FOG_GLSL}
void main() {
	if (dot(vWorld, uClip.xyz) + uClip.w < 0.0) discard;
	vec3 N = normalize(vNormal);
	if (uBack > 0.5) N = -N;
	vec3 V = normalize(uCamPos - vWorld);
	float dist = length(uCamPos - vWorld);

	// 霜纹：表面白色枝状纹理，水线以下被冲刷掉
	float frost = fbm(vWorld * 2.6 + 13.1);
	frost = smoothstep(0.56, 0.76, frost);
	float vein = smoothstep(0.48, 0.5, abs(fbm(vWorld * 5.2) - 0.5));
	frost = clamp(frost + (1.0 - vein) * 0.35, 0.0, 1.0);
	float wet = smoothstep(uWaterY + 0.35, uWaterY - 0.1, vWorld.y);
	frost *= 1.0 - wet;

	// 基色：内部更深更蓝，表面带霜
	vec3 deep = mix(vec3(0.035, 0.16, 0.30), vec3(0.02, 0.07, 0.16), uBack);
	vec3 frostCol = vec3(0.78, 0.88, 0.97);
	vec3 base = mix(deep, frostCol, frost * (1.0 - uBack));
	// 内部隐约的层理/裂隙，让剖面不只是平色
	float strata = fbm(vec3(vWorld.x * 0.7, vWorld.y * 2.2, vWorld.z * 0.7) + 4.7);
	base += vec3(0.02, 0.06, 0.10) * uBack * smoothstep(0.45, 0.75, strata);
	// 顶面积雪
	float snow = smoothstep(0.55, 0.8, N.y) * (1.0 - uBack);
	base = mix(base, vec3(0.88, 0.93, 0.98), snow * 0.8);

	// 光照（内表面提亮，模拟冰内散射，剖切后内部可读）
	float diff = max(dot(N, uSunDir), 0.0);
	vec3 H = normalize(uSunDir + V);
	float specPow = mix(28.0, 90.0, wet); // 水线以下更光滑
	float spec = pow(max(dot(N, H), 0.0), specPow) * mix(0.6, 1.6, wet);
	// 假次表面散射：逆光时透出蓝绿色
	float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * 0.6;
	vec3 ambient = mix(vec3(0.18, 0.25, 0.36), vec3(0.03, 0.05, 0.10), uNight);
	ambient = mix(ambient, vec3(0.16, 0.30, 0.44), uBack);

	vec3 col = base * (ambient + uSunColor * diff);
	col += vec3(0.15, 0.55, 0.6) * sss * (1.0 - uNight * 0.7);
	col += uSunColor * spec;

	// 菲涅尔边缘高光：夜间保留并增强，避免画面全黑
	float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
	vec3 rimCol = mix(uSunColor, vec3(0.45, 0.7, 1.0), uNight);
	col += rimCol * fres * mix(0.5, 1.1, uNight);

	// 水线：一条略亮的交界带
	float wl = 1.0 - smoothstep(0.0, 0.08, abs(vWorld.y - uWaterY));
	col += vec3(0.4, 0.55, 0.6) * wl * 0.7;

	float alpha = mix(0.62, 0.85, fres);
	alpha = mix(alpha, 0.95, uBack);        // 内表面更不透明
	alpha = mix(alpha, 0.9, wet * 0.4);
	alpha = mix(alpha, 0.97, snow * 0.7);

	col = applyFog(col, dist);
	outColor = vec4(col, alpha);
}
`;

export const BUBBLE_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec4 aPosSize;
uniform mat4 uViewProj;
uniform vec3 uCamPos;
out float vFogDist;
out vec3 vWorld;
void main() {
	vWorld = aPosSize.xyz;
	vFogDist = length(uCamPos - aPosSize.xyz);
	gl_Position = uViewProj * vec4(aPosSize.xyz, 1.0);
	float px = aPosSize.w * 900.0 / max(vFogDist, 0.5);
	gl_PointSize = clamp(px, 1.5, 42.0);
}
`;

export const BUBBLE_FS = /* glsl */ `#version 300 es
precision highp float;
in float vFogDist;
in vec3 vWorld;
uniform vec4 uClip;
uniform vec3 uSunColor;
uniform float uNight;
out vec4 outColor;
${FOG_GLSL}
void main() {
	if (dot(vWorld, uClip.xyz) + uClip.w < 0.0) discard;
	vec2 q = gl_PointCoord * 2.0 - 1.0;
	float r2 = dot(q, q);
	if (r2 > 1.0) discard;
	// 空心球泡：边缘亮环 + 顶部高光点
	float ring = smoothstep(0.45, 0.95, r2);
	float hl = exp(-28.0 * dot(q - vec2(-0.32, 0.36), q - vec2(-0.32, 0.36)));
	vec3 col = vec3(0.75, 0.88, 1.0) * (ring * 0.8 + hl * 1.4);
	col *= mix(vec3(1.0), uSunColor, 0.35);
	col = mix(col, vec3(0.5, 0.7, 1.0), uNight * 0.5);
	col = applyFog(col, vFogDist);
	float a = clamp(ring * 0.75 + hl, 0.0, 1.0) * 0.85;
	outColor = vec4(col, a);
}
`;

export const WATER_VS = /* glsl */ `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
out vec3 vWorld;
void main() {
	vWorld = aPos;
	gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

export const WATER_FS = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
uniform vec3 uCamPos;
uniform vec3 uSunDir, uSunColor;
uniform float uNight;
uniform float uTime;
out vec4 outColor;
${NOISE_GLSL}
${FOG_GLSL}
void main() {
	vec3 V = normalize(uCamPos - vWorld);
	float dist = length(uCamPos - vWorld);
	// 程序波纹法线
	vec3 p = vWorld * 0.55;
	float t = uTime * 0.6;
	float n1 = fbm(p + vec3(t, 0.0, t * 0.7));
	float n2 = fbm(p * 2.3 - vec3(t * 0.8, 0.0, t));
	vec3 N = normalize(vec3((n1 - 0.5) * 0.6, 1.0, (n2 - 0.5) * 0.6));
	float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
	vec3 deepCol = mix(vec3(0.02, 0.10, 0.16), vec3(0.005, 0.02, 0.05), uNight);
	vec3 skyCol = mix(uSunColor * 0.5 + vec3(0.2, 0.3, 0.4), vec3(0.03, 0.06, 0.12), uNight);
	vec3 col = mix(deepCol, skyCol, fres * 0.9 + 0.1);
	// 太阳倒影高光
	vec3 R = reflect(-V, N);
	float sd = max(dot(R, uSunDir), 0.0);
	col += uSunColor * (pow(sd, 240.0) * 2.2 + pow(sd, 24.0) * 0.12);
	col += vec3(0.4, 0.6, 0.9) * pow(sd, 240.0) * uNight * 1.5;
	col = applyFog(col, dist);
	outColor = vec4(col, 0.92);
}
`;
