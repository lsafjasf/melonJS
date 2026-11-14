/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { mixVec3, normalize, type Vec3 } from "./math";

export type LightMode = "noon" | "dusk" | "night";

export interface Palette {
	skyTop: Vec3;
	skyHorizon: Vec3;
	sunColor: Vec3;
	fogColor: Vec3;
	waterDeep: Vec3;
	waterShallow: Vec3;
	causticColor: Vec3;
	rimColor: Vec3;
	lightDir: Vec3;
	ambient: number;
	glow: number;
	stars: number;
	fogNear: number;
	fogFar: number;
}

export const LIGHT_MODES: LightMode[] = ["noon", "dusk", "night"];

export const MODE_LABEL: Record<LightMode, string> = {
	noon: "Noon",
	dusk: "Dusk",
	night: "Night",
};

export const MODE_ACCENT: Record<LightMode, string> = {
	noon: "#9fe7df",
	dusk: "#ff9d72",
	night: "#76c7ff",
};

export const PALETTES: Record<LightMode, Palette> = {
	noon: {
		skyTop: [0.16, 0.43, 0.72],
		skyHorizon: [0.67, 0.88, 0.91],
		sunColor: [1, 0.93, 0.74],
		fogColor: [0.52, 0.76, 0.82],
		waterDeep: [0.012, 0.12, 0.19],
		waterShallow: [0.05, 0.54, 0.56],
		causticColor: [0.72, 1, 0.8],
		rimColor: [0.77, 1, 1],
		lightDir: normalize([-0.3, 0.68, -0.55]),
		ambient: 0.34,
		glow: 0.16,
		stars: 0,
		fogNear: 10,
		fogFar: 39,
	},
	dusk: {
		skyTop: [0.055, 0.075, 0.21],
		skyHorizon: [1, 0.36, 0.25],
		sunColor: [1, 0.62, 0.3],
		fogColor: [0.3, 0.18, 0.32],
		waterDeep: [0.018, 0.035, 0.14],
		waterShallow: [0.43, 0.12, 0.34],
		causticColor: [1, 0.58, 0.36],
		rimColor: [1, 0.49, 0.39],
		lightDir: normalize([-0.55, 0.2, -0.6]),
		ambient: 0.26,
		glow: 0.34,
		stars: 0.28,
		fogNear: 8,
		fogFar: 35,
	},
	night: {
		skyTop: [0.006, 0.012, 0.038],
		skyHorizon: [0.027, 0.1, 0.2],
		sunColor: [0.62, 0.8, 1],
		fogColor: [0.045, 0.075, 0.15],
		waterDeep: [0.004, 0.022, 0.06],
		waterShallow: [0.026, 0.25, 0.36],
		causticColor: [0.34, 0.94, 1],
		rimColor: [0.23, 0.72, 1],
		lightDir: normalize([-0.18, 0.4, -0.9]),
		ambient: 0.17,
		glow: 0.72,
		stars: 1,
		fogNear: 6,
		fogFar: 32,
	},
};

const mixNumber = (a: number, b: number, t: number) => a + (b - a) * t;

export const blendPalette = (
	from: Palette,
	to: Palette,
	t: number,
): Palette => ({
	skyTop: mixVec3(from.skyTop, to.skyTop, t),
	skyHorizon: mixVec3(from.skyHorizon, to.skyHorizon, t),
	sunColor: mixVec3(from.sunColor, to.sunColor, t),
	fogColor: mixVec3(from.fogColor, to.fogColor, t),
	waterDeep: mixVec3(from.waterDeep, to.waterDeep, t),
	waterShallow: mixVec3(from.waterShallow, to.waterShallow, t),
	causticColor: mixVec3(from.causticColor, to.causticColor, t),
	rimColor: mixVec3(from.rimColor, to.rimColor, t),
	lightDir: mixVec3(from.lightDir, to.lightDir, t),
	ambient: mixNumber(from.ambient, to.ambient, t),
	glow: mixNumber(from.glow, to.glow, t),
	stars: mixNumber(from.stars, to.stars, t),
	fogNear: mixNumber(from.fogNear, to.fogNear, t),
	fogFar: mixNumber(from.fogFar, to.fogFar, t),
});
