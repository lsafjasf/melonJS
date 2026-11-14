/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { SCENE_HEIGHT, SCENE_WIDTH } from "./project";
import type { SceneCaches } from "./scene-art";
import {
	type BookProject,
	LAYER_IDS,
	type LayerId,
	LIGHT_PRESETS,
	type SampledPose,
} from "./types";

const STAGE_CENTER_X = 600;

const LAYER_CENTERS: Record<LayerId, { x: number; y: number }> = {
	mountains: { x: 600, y: 440 },
	clouds: { x: 600, y: 265 },
	trees: { x: 600, y: 520 },
	character: { x: 600, y: 475 },
};

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const hexToRgba = (hex: string, alpha: number) => {
	const value = hex.replace("#", "");
	if (value.length !== 6) {
		return `rgba(255, 210, 119, ${alpha})`;
	}
	const red = Number.parseInt(value.slice(0, 2), 16);
	const green = Number.parseInt(value.slice(2, 4), 16);
	const blue = Number.parseInt(value.slice(4, 6), 16);
	return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const tracePages = (context: CanvasRenderingContext2D) => {
	context.beginPath();
	// left page
	context.moveTo(98, 158);
	context.bezierCurveTo(310, 112, 506, 123, 596, 139);
	context.lineTo(596, 600);
	context.bezierCurveTo(507, 579, 309, 568, 98, 607);
	context.closePath();
	// right page
	context.moveTo(604, 139);
	context.bezierCurveTo(694, 123, 890, 112, 1102, 158);
	context.lineTo(1102, 607);
	context.bezierCurveTo(891, 568, 693, 579, 604, 600);
	context.closePath();
};

const traceCover = (context: CanvasRenderingContext2D) => {
	context.beginPath();
	context.moveTo(78, 166);
	context.bezierCurveTo(297, 108, 489, 103, 600, 124);
	context.bezierCurveTo(711, 103, 903, 108, 1122, 166);
	context.lineTo(1115, 626);
	context.bezierCurveTo(895, 583, 701, 576, 600, 597);
	context.bezierCurveTo(499, 576, 305, 583, 85, 626);
	context.closePath();
};

const traceStageClip = (context: CanvasRenderingContext2D) => {
	context.beginPath();
	context.moveTo(112, 173);
	context.bezierCurveTo(319, 133, 508, 143, 594, 157);
	context.lineTo(594, 586);
	context.bezierCurveTo(510, 568, 318, 574, 112, 594);
	context.closePath();
	context.moveTo(606, 157);
	context.bezierCurveTo(692, 143, 881, 133, 1088, 173);
	context.lineTo(1088, 594);
	context.bezierCurveTo(882, 574, 690, 568, 606, 586);
	context.closePath();
};

const drawBackdrop = (
	context: CanvasRenderingContext2D,
	project: BookProject,
) => {
	const room = context.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
	room.addColorStop(0, "#12141c");
	room.addColorStop(0.55, "#171720");
	room.addColorStop(1, "#101116");
	context.fillStyle = room;
	context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

	const halo = context.createRadialGradient(
		STAGE_CENTER_X,
		330,
		60,
		STAGE_CENTER_X,
		330,
		720,
	);
	halo.addColorStop(0, hexToRgba(project.light.glow, 0.16));
	halo.addColorStop(0.45, hexToRgba(project.light.glow, 0.045));
	halo.addColorStop(1, "rgba(0, 0, 0, 0)");
	context.fillStyle = halo;
	context.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

	// A quiet, hand-stippled desk surface.
	context.fillStyle = "rgba(255, 247, 227, 0.2)";
	let seed = 7103;
	const random = () => {
		seed = (seed * 1103515245 + 12345) >>> 0;
		return seed / 0xffffffff;
	};
	for (let index = 0; index < 90; index++) {
		const x = random() * SCENE_WIDTH;
		const y = random() * SCENE_HEIGHT;
		const radius = 0.35 + random() * 0.85;
		context.beginPath();
		context.arc(x, y, radius, 0, Math.PI * 2);
		context.closePath();
		context.fill();
	}
};

const drawBookBase = (context: CanvasRenderingContext2D) => {
	// Soft cast shadow beneath the book.
	context.save();
	context.filter = "blur(22px)";
	context.fillStyle = "rgba(0, 0, 0, 0.55)";
	context.beginPath();
	context.ellipse(600, 621, 485, 44, 0, 0, Math.PI * 2);
	context.closePath();
	context.fill();
	context.restore();

	// Leather cover.
	traceCover(context);
	const cover = context.createLinearGradient(0, 110, 0, 640);
	cover.addColorStop(0, "#56383b");
	cover.addColorStop(0.58, "#38262c");
	cover.addColorStop(1, "#251c24");
	context.fillStyle = cover;
	context.fill();
	context.strokeStyle = "rgba(248, 209, 153, 0.2)";
	context.lineWidth = 1.4;
	context.stroke();

	// Page stack: three offset copies read as cut paper edges.
	for (const [offset, color] of [
		[11, "rgba(181, 156, 120, 0.45)"],
		[7, "rgba(216, 193, 155, 0.6)"],
		[4, "rgba(238, 219, 181, 0.8)"],
	] as const) {
		context.save();
		context.translate(0, offset);
		tracePages(context);
		context.fillStyle = color;
		context.fill();
		context.restore();
	}

	// The open pages.
	tracePages(context);
	const pageFill = context.createLinearGradient(92, 0, 1108, 0);
	pageFill.addColorStop(0, "#d9c39f");
	pageFill.addColorStop(0.18, "#f2e3c8");
	pageFill.addColorStop(0.48, "#fbf1df");
	pageFill.addColorStop(0.52, "#f6ead4");
	pageFill.addColorStop(0.82, "#f0e0c2");
	pageFill.addColorStop(1, "#d4bc97");
	context.fillStyle = pageFill;
	context.fill();

	context.strokeStyle = "rgba(91, 69, 48, 0.4)";
	context.lineWidth = 1.3;
	context.stroke();
};

const drawSky = (
	context: CanvasRenderingContext2D,
	project: BookProject,
	pose: SampledPose,
) => {
	const sky = context.createLinearGradient(0, 150, 0, 590);
	sky.addColorStop(0, "#d6e6df");
	sky.addColorStop(0.42, "#e7e8d4");
	sky.addColorStop(0.7, "#f2dbb9");
	sky.addColorStop(1, "#d9bc91");
	context.fillStyle = sky;
	context.fillRect(70, 130, 1060, 480);

	// Glow sits behind the paper scenery, so the light reads as incident.
	const glow = context.createRadialGradient(
		pose.lightX,
		pose.lightY,
		18,
		pose.lightX,
		pose.lightY,
		355,
	);
	glow.addColorStop(0, hexToRgba(project.light.color, 0.27));
	glow.addColorStop(0.38, hexToRgba(project.light.glow, 0.12));
	glow.addColorStop(1, "rgba(255, 240, 200, 0)");
	context.fillStyle = glow;
	context.fillRect(70, 130, 1060, 480);

	// Soft horizontal paper bands in the sky.
	context.save();
	context.globalAlpha = 0.34;
	for (const [y, height, color] of [
		[317, 28, "#f9f2dc"],
		[355, 18, "#f4e9cf"],
		[392, 12, "#ead8b8"],
	] as const) {
		context.fillStyle = color;
		context.beginPath();
		context.moveTo(100, y);
		context.bezierCurveTo(360, y - 9, 796, y + 10, 1110, y - 4);
		context.lineTo(1110, y + height);
		context.bezierCurveTo(
			790,
			y + height + 8,
			340,
			y + height - 8,
			100,
			y + height + 4,
		);
		context.closePath();
		context.fill();
	}
	context.restore();

	// Faint horizon folds.
	context.strokeStyle = "rgba(118, 111, 91, 0.18)";
	context.lineWidth = 1;
	for (const y of [344, 376, 407]) {
		context.beginPath();
		context.moveTo(112, y);
		context.quadraticCurveTo(600, y - 5, 1088, y + 2);
		context.stroke();
	}
};

const drawLayer = (
	context: CanvasRenderingContext2D,
	project: BookProject,
	pose: SampledPose,
	caches: SceneCaches,
	id: LayerId,
	parallaxX: number,
	parallaxY: number,
) => {
	const layer = project.layers[id];
	const art = caches.layers[id];
	const depthWeight = 0.22 + layer.depth * 0.78;
	const x = pose.offsets[id] + parallaxX * depthWeight;
	const y = parallaxY * layer.depth * 0.42;
	const center = LAYER_CENTERS[id];
	const shadowX = clamp(
		(STAGE_CENTER_X - pose.lightX) *
			(0.035 + layer.depth * 0.035) *
			layer.shadow,
		-54,
		54,
	);
	const shadowY = clamp(
		(center.y - pose.lightY) * 0.014 * layer.depth * layer.shadow +
			11 * layer.shadow,
		2,
		38,
	);
	const shadowAlpha = 0.13 + layer.shadow * 0.43;
	const blur = clamp(layer.blur, 0, 12);

	// Pass 1: the paper layer and its shadow.
	context.save();
	context.shadowColor = `rgba(24, 20, 30, ${shadowAlpha})`;
	context.shadowBlur = 5 + layer.depth * 8 + layer.shadow * 12;
	context.shadowOffsetX = shadowX;
	context.shadowOffsetY = shadowY;
	if (blur > 0.04) {
		context.filter = `blur(${blur}px)`;
	}
	context.drawImage(art.content, x, y);
	context.restore();

	// Pass 2: a silhouette pulled toward the lamp leaves a glowing rim on the
	// side the light reaches.
	const vectorX = pose.lightX - (center.x + x);
	const vectorY = pose.lightY - (center.y + y);
	const length = Math.max(1, Math.hypot(vectorX, vectorY));
	const rimX = (vectorX / length) * (1.8 + layer.depth * 1.5);
	const rimY = (vectorY / length) * (1.1 + layer.depth * 0.9);
	if (layer.shadow > 0.01) {
		context.save();
		context.globalCompositeOperation = "screen";
		context.globalAlpha = clamp(
			0.055 + layer.shadow * 0.18 + layer.depth * 0.055,
			0,
			0.42,
		);
		if (blur > 0.04) {
			context.filter = `blur(${Math.max(0.2, blur * 0.45)}px)`;
		}
		context.drawImage(art.silhouette, x + rimX, y + rimY);
		context.restore();
	}

	// Pass 3: the crisp, unobscured layer sits over the rim light.
	context.save();
	if (blur > 0.04) {
		context.filter = `blur(${blur}px)`;
	}
	context.drawImage(art.content, x, y);
	context.restore();
};

const drawLighting = (
	context: CanvasRenderingContext2D,
	project: BookProject,
	pose: SampledPose,
) => {
	const preset = LIGHT_PRESETS[project.light.preset];

	// Ambient falloff: the further from the lamp, the more the paper darkens.
	context.save();
	context.globalCompositeOperation = "multiply";
	const ambient = context.createRadialGradient(
		pose.lightX,
		pose.lightY,
		48,
		pose.lightX,
		pose.lightY,
		590,
	);
	ambient.addColorStop(0, "rgba(255, 255, 255, 0)");
	ambient.addColorStop(0.32, "rgba(38, 41, 53, 0.04)");
	ambient.addColorStop(0.72, hexToRgba(preset.ambient, 0.28));
	ambient.addColorStop(1, hexToRgba(preset.ambient, 0.76));
	context.fillStyle = ambient;
	context.fillRect(70, 130, 1060, 480);
	context.restore();

	// Additive bloom around the light.
	context.save();
	context.globalCompositeOperation = "screen";
	const bloom = context.createRadialGradient(
		pose.lightX,
		pose.lightY,
		4,
		pose.lightX,
		pose.lightY,
		205 * project.light.intensity,
	);
	bloom.addColorStop(0, hexToRgba(project.light.color, 0.3));
	bloom.addColorStop(0.25, hexToRgba(project.light.glow, 0.14));
	bloom.addColorStop(1, "rgba(255, 255, 255, 0)");
	context.fillStyle = bloom;
	context.fillRect(70, 130, 1060, 480);
	context.restore();

	// Warm bounce on the near edge of the page.
	context.save();
	context.globalCompositeOperation = "screen";
	context.globalAlpha = 0.16 * project.light.intensity;
	const bounce = context.createLinearGradient(0, 500, 0, 610);
	bounce.addColorStop(0, "rgba(255, 255, 255, 0)");
	bounce.addColorStop(1, hexToRgba(project.light.glow, 0.8));
	context.fillStyle = bounce;
	context.fillRect(112, 500, 976, 102);
	context.restore();
};

const drawLamp = (
	context: CanvasRenderingContext2D,
	project: BookProject,
	pose: SampledPose,
) => {
	const radius = 15 + project.light.intensity * 4;
	const glowRadius = 95 + project.light.intensity * 65;
	context.save();
	context.globalCompositeOperation = "screen";
	const glow = context.createRadialGradient(
		pose.lightX,
		pose.lightY,
		2,
		pose.lightX,
		pose.lightY,
		glowRadius,
	);
	glow.addColorStop(0, hexToRgba(project.light.color, 0.58));
	glow.addColorStop(0.24, hexToRgba(project.light.glow, 0.22));
	glow.addColorStop(1, "rgba(255, 255, 255, 0)");
	context.fillStyle = glow;
	context.beginPath();
	context.arc(pose.lightX, pose.lightY, glowRadius, 0, Math.PI * 2);
	context.closePath();
	context.fill();
	context.restore();

	// Cut-paper rays.
	context.save();
	context.translate(pose.lightX, pose.lightY);
	context.rotate(-0.16);
	context.fillStyle = hexToRgba(project.light.glow, 0.2);
	for (let index = 0; index < 12; index++) {
		context.rotate(Math.PI / 6);
		context.beginPath();
		context.moveTo(radius + 6, -3);
		context.lineTo(radius + 30, 0);
		context.lineTo(radius + 9, 3.2);
		context.closePath();
		context.fill();
	}
	context.restore();

	// Paper disc with a folded highlight.
	const disc = context.createRadialGradient(
		pose.lightX - radius * 0.34,
		pose.lightY - radius * 0.4,
		1,
		pose.lightX,
		pose.lightY,
		radius,
	);
	disc.addColorStop(0, "#fffdf1");
	disc.addColorStop(0.45, project.light.color);
	disc.addColorStop(1, project.light.glow);
	context.save();
	context.shadowColor = project.light.glow;
	context.shadowBlur = 20;
	context.fillStyle = disc;
	context.beginPath();
	context.arc(pose.lightX, pose.lightY, radius, 0, Math.PI * 2);
	context.closePath();
	context.fill();
	context.restore();

	context.strokeStyle = hexToRgba("#fff7e3", 0.64);
	context.lineWidth = 1.2;
	context.beginPath();
	context.arc(
		pose.lightX - radius * 0.08,
		pose.lightY - radius * 0.08,
		radius,
		Math.PI * 1.05,
		Math.PI * 1.7,
	);
	context.stroke();

	// Subtle grab ring: the light is a direct-manipulation handle.
	context.strokeStyle = "rgba(255, 248, 226, 0.34)";
	context.lineWidth = 1;
	context.setLineDash([3, 7]);
	context.beginPath();
	context.arc(pose.lightX, pose.lightY, radius + 14, 0, Math.PI * 2);
	context.stroke();
	context.setLineDash([]);

	// A four-point sparkle makes the lamp's centre readable at a glance.
	context.strokeStyle = "rgba(255, 255, 244, 0.74)";
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(pose.lightX - radius - 4, pose.lightY);
	context.lineTo(pose.lightX - radius + 4, pose.lightY);
	context.moveTo(pose.lightX + radius - 4, pose.lightY);
	context.lineTo(pose.lightX + radius + 4, pose.lightY);
	context.stroke();
};

const drawBookFinish = (
	context: CanvasRenderingContext2D,
	project: BookProject,
) => {
	// Center fold.
	const fold = context.createLinearGradient(567, 0, 633, 0);
	fold.addColorStop(0, "rgba(79, 58, 42, 0)");
	fold.addColorStop(0.42, "rgba(79, 58, 42, 0.16)");
	fold.addColorStop(0.5, "rgba(61, 42, 33, 0.32)");
	fold.addColorStop(0.58, "rgba(79, 58, 42, 0.15)");
	fold.addColorStop(1, "rgba(79, 58, 42, 0)");
	context.fillStyle = fold;
	context.fillRect(567, 140, 66, 455);

	context.strokeStyle = "rgba(92, 65, 47, 0.2)";
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(600, 143);
	context.bezierCurveTo(596, 290, 604, 451, 600, 597);
	context.stroke();

	// Page rim highlights.
	context.save();
	context.strokeStyle = "rgba(255, 248, 226, 0.52)";
	context.lineWidth = 1.3;
	context.beginPath();
	context.moveTo(98, 158);
	context.bezierCurveTo(310, 112, 506, 123, 596, 139);
	context.moveTo(604, 139);
	context.bezierCurveTo(694, 123, 890, 112, 1102, 158);
	context.stroke();
	context.restore();

	context.save();
	context.strokeStyle = "rgba(255, 249, 232, 0.36)";
	context.lineWidth = 1.1;
	context.beginPath();
	context.moveTo(112, 594);
	context.bezierCurveTo(318, 574, 510, 568, 594, 586);
	context.moveTo(606, 586);
	context.bezierCurveTo(690, 568, 882, 574, 1088, 594);
	context.stroke();
	context.restore();

	// Ribbon bookmark.
	context.save();
	context.fillStyle = "#8f3f43";
	context.beginPath();
	context.moveTo(594, 126);
	context.lineTo(606, 126);
	context.lineTo(606, 190);
	context.lineTo(600, 181);
	context.lineTo(594, 190);
	context.closePath();
	context.fill();
	context.fillStyle = "rgba(255, 212, 160, 0.32)";
	context.fillRect(595, 127, 3, 54);
	context.restore();

	// A tiny glint along the light-facing page curve.
	context.save();
	context.globalCompositeOperation = "screen";
	context.globalAlpha = 0.22;
	const glint = context.createLinearGradient(0, 150, 0, 230);
	glint.addColorStop(0, hexToRgba(project.light.color, 0.8));
	glint.addColorStop(1, "rgba(255, 255, 255, 0)");
	context.fillStyle = glint;
	context.fillRect(112, 150, 976, 80);
	context.restore();
};

export const drawScene = (
	context: CanvasRenderingContext2D,
	project: BookProject,
	pose: SampledPose,
	caches: SceneCaches,
	parallaxX: number,
	parallaxY: number,
) => {
	context.clearRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);
	drawBackdrop(context, project);
	drawBookBase(context);

	context.save();
	traceStageClip(context);
	context.clip();
	drawSky(context, project, pose);
	for (const id of LAYER_IDS) {
		drawLayer(context, project, pose, caches, id, parallaxX, parallaxY);
	}
	context.save();
	context.globalAlpha = 0.9;
	context.drawImage(caches.grain, 0, 0);
	context.restore();
	drawLighting(context, project, pose);
	drawLamp(context, project, pose);
	context.restore();

	drawBookFinish(context, project);
};
