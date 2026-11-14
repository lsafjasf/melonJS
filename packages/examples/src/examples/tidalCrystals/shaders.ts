/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * All lighting, water, caustics and fog are evaluated in code. There are no
 * model, texture or image assets in this scene.
 */

export const SKY_VERTEX = `#version 300 es
precision highp float;
out vec2 vNdc;
void main() {
	const vec2 corners[3] = vec2[3](
		vec2(-1.0, -1.0),
		vec2(3.0, -1.0),
		vec2(-1.0, 3.0)
	);
	vNdc = corners[gl_VertexID];
	gl_Position = vec4(vNdc, 0.0, 1.0);
}
`;

export const SKY_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 fragColor;

uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uForward;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uFogColor;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uStars;
uniform float uTime;

float hash13(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.yzx + 33.33);
	return fract((p.x + p.y) * p.z);
}

void main() {
	vec3 dir = normalize(
		uForward +
		uRight * (vNdc.x * uTanHalfFov * uAspect) +
		uUp * (vNdc.y * uTanHalfFov)
	);
	float elevation = clamp(dir.y, 0.0, 1.0);
	vec3 sky = mix(uSkyHorizon, uSkyTop, pow(elevation, 0.46));
	float horizonHaze = exp(-abs(dir.y) * 13.0);
	sky = mix(sky, uFogColor, horizonHaze * 0.34);

	float sun = max(dot(dir, normalize(uSunDir)), 0.0);
	sky += uSunColor * pow(sun, 820.0) * 4.2;
	sky += uSunColor * pow(sun, 20.0) * 0.15;
	sky += uSunColor * pow(sun, 4.0) * 0.045;

	vec3 starCell = dir * 310.0;
	vec3 cell = floor(starCell);
	float point = length(fract(starCell) - 0.5);
	float seed = hash13(cell);
	float twinkle = 0.76 + 0.24 * sin(uTime * 2.2 + seed * 50.0);
	float star = smoothstep(0.03, 0.0, point - 0.018);
	star *= step(0.9945, seed) * uStars * twinkle;
	sky += vec3(0.55, 0.74, 1.0) * star * 2.1;

	float vignette = 1.0 - 0.18 * pow(length(vNdc * vec2(0.72, 0.9)), 2.3);
	fragColor = vec4(sky * vignette, 1.0);
}
`;

export const CRYSTAL_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aTint;
layout(location = 3) in float aSeed;

uniform mat4 uViewProj;

out vec3 vWorld;
out vec3 vNormal;
out vec3 vTint;
out float vSeed;

void main() {
	vWorld = aPosition;
	vNormal = aNormal;
	vTint = aTint;
	vSeed = aSeed;
	gl_Position = uViewProj * vec4(aPosition, 1.0);
}
`;

export const CRYSTAL_FRAGMENT = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
in vec3 vTint;
in float vSeed;
out vec4 fragColor;

uniform vec3 uCamera;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uRimColor;
uniform vec3 uCausticColor;
uniform vec3 uFogColor;
uniform float uWaterLevel;
uniform float uTime;
uniform float uAmbient;
uniform float uGlow;
uniform float uFogNear;
uniform float uFogFar;

float caustic(vec2 p, float t) {
	vec2 q = p;
	float bands = 0.0;
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		q += vec2(
			sin(q.y * 1.55 + t * (0.62 + fi * 0.09)),
			cos(q.x * 1.35 - t * (0.50 + fi * 0.12))
		) * 0.38;
		float line = abs(
			sin(q.x * 1.9 + t * 0.23) +
			sin(q.y * 1.5 - t * 0.31)
		);
		bands += pow(max(0.0, 1.0 - line * 0.46), 7.0);
	}
	return bands * 0.33;
}

void main() {
	vec3 normal = normalize(vNormal);
	vec3 viewDir = normalize(uCamera - vWorld);
	vec3 halfDir = normalize(viewDir + uLightDir);

	float depthBelow = max(uWaterLevel - vWorld.y, 0.0);
	float submerged = smoothstep(0.0, 0.08, depthBelow);
	float depthFade = smoothstep(0.0, 3.8, depthBelow);
	float ndl = max(dot(normal, uLightDir), 0.0);

	float heightMix = clamp((vWorld.y + 2.2) / 7.2, 0.0, 1.0);
	vec3 base = vTint * (0.72 + 0.38 * heightMix);
	base = mix(base, base * vec3(0.34, 0.78, 0.98), submerged * depthFade * 0.7);
	vec3 color = base * (uAmbient + ndl * 0.92);

	float specular = pow(max(dot(normal, halfDir), 0.0), 64.0);
	color += uSunColor * specular * (0.5 + 0.35 * submerged);

	float rim = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.1);
	color += uRimColor * rim * (0.68 + uGlow * 1.12);

	float tideLight = caustic(
		vWorld.xz * 0.72 + vec2(vWorld.y * 0.12, -vWorld.y * 0.08),
		uTime * 0.58
	);
	color += uCausticColor * tideLight * submerged * (0.24 + depthFade * 0.9);

	float waterline = 1.0 - smoothstep(0.0, 0.065, abs(vWorld.y - uWaterLevel));
	color += uSunColor * waterline * (0.24 + 0.22 * uGlow);

	float vein = 0.5 + 0.5 * sin(vWorld.y * 7.0 + vSeed * 11.0 + normal.x * 3.0);
	color *= 0.93 + vein * 0.07;
	color += vTint * uGlow * (0.14 + rim * 0.32);

	float fog = smoothstep(uFogNear, uFogFar, distance(uCamera, vWorld));
	color = mix(color, uFogColor, fog * 0.86);
	fragColor = vec4(color, 1.0);
}
`;

export const WATER_VERTEX = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;

uniform mat4 uViewProj;
uniform float uTime;
uniform float uWaveAmp;
uniform float uWaveSpeed;
uniform float uWaterLevel;

out vec3 vWorld;
out vec3 vNormal;

float waveHeight(vec2 p, float t) {
	return
		sin(p.x * 0.58 + t * 0.78) * 0.085 +
		sin(p.y * 0.81 - t * 0.61) * 0.062 +
		sin((p.x + p.y) * 0.34 + t * 0.39) * 0.052;
}

void main() {
	float t = uTime * uWaveSpeed;
	vec2 p = aPosition;
	float height = waveHeight(p, t) * uWaveAmp;
	float epsilon = 0.11;
	float left = waveHeight(p - vec2(epsilon, 0.0), t);
	float right = waveHeight(p + vec2(epsilon, 0.0), t);
	float back = waveHeight(p - vec2(0.0, epsilon), t);
	float front = waveHeight(p + vec2(0.0, epsilon), t);

	vWorld = vec3(p.x, uWaterLevel + height, p.y);
	vNormal = normalize(vec3(
		(left - right) * uWaveAmp,
		epsilon * 2.0,
		(back - front) * uWaveAmp
	));
	gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

export const WATER_FRAGMENT = `#version 300 es
precision highp float;

in vec3 vWorld;
in vec3 vNormal;
out vec4 fragColor;

uniform vec3 uCamera;
uniform vec3 uLightDir;
uniform vec3 uSunColor;
uniform vec3 uCausticColor;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFogColor;
uniform float uTime;
uniform float uTide;
uniform float uFogNear;
uniform float uFogFar;

float caustic(vec2 p, float t) {
	vec2 q = p;
	float bands = 0.0;
	for (int i = 0; i < 3; i++) {
		float fi = float(i);
		q += vec2(
			sin(q.y * 1.55 + t * (0.62 + fi * 0.09)),
			cos(q.x * 1.35 - t * (0.50 + fi * 0.12))
		) * 0.38;
		float line = abs(
			sin(q.x * 1.9 + t * 0.23) +
			sin(q.y * 1.5 - t * 0.31)
		);
		bands += pow(max(0.0, 1.0 - line * 0.46), 7.0);
	}
	return bands * 0.33;
}

void main() {
	vec3 normal = normalize(vNormal);
	vec3 viewDir = normalize(uCamera - vWorld);
	vec3 reflected = reflect(-viewDir, normal);
	float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);
	float ndl = max(dot(normal, uLightDir), 0.0);
	float specular = pow(max(dot(reflected, uLightDir), 0.0), 180.0);

	vec3 water = mix(
		uDeepColor,
		uShallowColor,
		clamp(normal.y * 0.7 + 0.26, 0.0, 1.0)
	);
	vec3 color = water * (0.46 + ndl * 0.64);
	color += uSunColor * specular * 1.7;

	float tideLight = caustic(
		vWorld.xz * 0.56 + vec2(uTime * 0.035, -uTime * 0.052),
		uTime * 0.68
	);
	color += uCausticColor * tideLight * (0.16 + fresnel * 0.35);

	float fog = smoothstep(uFogNear, uFogFar, distance(uCamera, vWorld));
	color = mix(color, uFogColor, fog * 0.8);
	float alpha = mix(0.43, 0.79, fresnel);
	alpha = mix(alpha, min(1.0, alpha + 0.2), uTide);
	fragColor = vec4(color, alpha);
}
`;
