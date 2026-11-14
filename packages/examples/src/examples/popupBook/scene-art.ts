/**
 * melonJS — 2.5D pop-up book editor.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Every visual in the book is authored with the Canvas 2D path API. Layers
 * are baked once, then composited each frame so their blur, shadow and rim
 * light can react to the editor.
 */

import { SCENE_HEIGHT, SCENE_WIDTH } from "./project";
import type { LayerId } from "./types";

export interface LayerArt {
	content: HTMLCanvasElement;
	silhouette: HTMLCanvasElement;
}

export interface SceneCaches {
	layers: Record<LayerId, LayerArt>;
	grain: HTMLCanvasElement;
}

const makeCanvas = () => {
	const canvas = document.createElement("canvas");
	canvas.width = SCENE_WIDTH;
	canvas.height = SCENE_HEIGHT;
	return canvas;
};

const contextFor = (canvas: HTMLCanvasElement) => {
	const context = canvas.getContext("2d");
	if (context === null) {
		throw new Error("Canvas 2D context is unavailable.");
	}
	return context;
};

const path = (
	context: CanvasRenderingContext2D,
	commands: Array<(context: CanvasRenderingContext2D) => void>,
) => {
	context.beginPath();
	for (const command of commands) {
		command(context);
	}
};

const drawMountains = (context: CanvasRenderingContext2D) => {
	// The back ridge is washed out to sell the distance.
	const back = context.createLinearGradient(0, 300, 0, 560);
	back.addColorStop(0, "#aebdb1");
	back.addColorStop(0.55, "#78958c");
	back.addColorStop(1, "#4c7068");
	path(context, [
		(ctx) => ctx.moveTo(72, 532),
		(ctx) => ctx.lineTo(150, 422),
		(ctx) => ctx.lineTo(214, 460),
		(ctx) => ctx.lineTo(318, 354),
		(ctx) => ctx.lineTo(394, 438),
		(ctx) => ctx.lineTo(484, 373),
		(ctx) => ctx.lineTo(562, 446),
		(ctx) => ctx.lineTo(656, 360),
		(ctx) => ctx.lineTo(733, 430),
		(ctx) => ctx.lineTo(828, 326),
		(ctx) => ctx.lineTo(909, 421),
		(ctx) => ctx.lineTo(1002, 357),
		(ctx) => ctx.lineTo(1128, 474),
		(ctx) => ctx.lineTo(1128, 610),
		(ctx) => ctx.lineTo(72, 610),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = back;
	context.fill();

	// Little faceted folds turn the flat silhouette into folded paper.
	const backFacets = [
		[318, 354, 285, 470, 382, 470, "rgba(241, 239, 222, 0.2)"],
		[318, 354, 382, 470, 348, 470, "rgba(29, 55, 53, 0.16)"],
		[656, 360, 610, 470, 712, 470, "rgba(241, 239, 222, 0.16)"],
		[656, 360, 712, 470, 681, 470, "rgba(29, 55, 53, 0.18)"],
		[828, 326, 782, 455, 878, 455, "rgba(241, 239, 222, 0.18)"],
		[828, 326, 878, 455, 850, 455, "rgba(29, 55, 53, 0.16)"],
	];
	for (const [x1, y1, x2, y2, x3, y3, color] of backFacets) {
		path(context, [
			(ctx) => ctx.moveTo(x1 as number, y1 as number),
			(ctx) => ctx.lineTo(x2 as number, y2 as number),
			(ctx) => ctx.lineTo(x3 as number, y3 as number),
			(ctx) => ctx.closePath(),
		]);
		context.fillStyle = color as string;
		context.fill();
	}

	// Cream snow caps catch the lamp along the top edge.
	const caps = [
		[318, 354, 298, 384, 312, 378, 322, 388, 338, 378],
		[656, 360, 638, 390, 652, 382, 663, 392, 678, 384],
		[828, 326, 806, 356, 821, 348, 832, 360, 849, 350],
	];
	for (const [x, y, lx, ly, ix, iy, rx, ry, ex, ey] of caps) {
		path(context, [
			(ctx) => ctx.moveTo(x as number, y as number),
			(ctx) => ctx.lineTo(lx as number, ly as number),
			(ctx) => ctx.lineTo(ix as number, iy as number),
			(ctx) => ctx.lineTo(rx as number, ry as number),
			(ctx) => ctx.lineTo(ex as number, ey as number),
			(ctx) => ctx.closePath(),
		]);
		context.fillStyle = "#f4edda";
		context.fill();
		context.strokeStyle = "rgba(91, 115, 105, 0.35)";
		context.lineWidth = 1.2;
		context.stroke();
	}

	// Front ridge, darker and closer.
	const front = context.createLinearGradient(0, 390, 0, 590);
	front.addColorStop(0, "#557b6d");
	front.addColorStop(0.52, "#365e54");
	front.addColorStop(1, "#203f38");
	path(context, [
		(ctx) => ctx.moveTo(54, 548),
		(ctx) => ctx.lineTo(142, 451),
		(ctx) => ctx.lineTo(221, 484),
		(ctx) => ctx.lineTo(338, 392),
		(ctx) => ctx.lineTo(432, 482),
		(ctx) => ctx.lineTo(526, 426),
		(ctx) => ctx.lineTo(627, 487),
		(ctx) => ctx.lineTo(706, 417),
		(ctx) => ctx.lineTo(798, 478),
		(ctx) => ctx.lineTo(894, 405),
		(ctx) => ctx.lineTo(982, 466),
		(ctx) => ctx.lineTo(1068, 421),
		(ctx) => ctx.lineTo(1148, 493),
		(ctx) => ctx.lineTo(1148, 630),
		(ctx) => ctx.lineTo(54, 630),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = front;
	context.fill();

	// A few lit left-hand faces on the near ridge.
	const frontFacets = [
		[338, 392, 284, 540, 390, 540, "rgba(210, 226, 208, 0.15)"],
		[338, 392, 390, 540, 354, 540, "rgba(15, 40, 36, 0.2)"],
		[894, 405, 837, 540, 946, 540, "rgba(210, 226, 208, 0.14)"],
		[894, 405, 946, 540, 910, 540, "rgba(15, 40, 36, 0.2)"],
	];
	for (const [x1, y1, x2, y2, x3, y3, color] of frontFacets) {
		path(context, [
			(ctx) => ctx.moveTo(x1 as number, y1 as number),
			(ctx) => ctx.lineTo(x2 as number, y2 as number),
			(ctx) => ctx.lineTo(x3 as number, y3 as number),
			(ctx) => ctx.closePath(),
		]);
		context.fillStyle = color as string;
		context.fill();
	}

	// Ridge contour and a pair of tiny cut-paper birds.
	context.strokeStyle = "rgba(22, 53, 48, 0.44)";
	context.lineWidth = 1.6;
	path(context, [
		(ctx) => ctx.moveTo(54, 548),
		(ctx) => ctx.lineTo(142, 451),
		(ctx) => ctx.lineTo(221, 484),
		(ctx) => ctx.lineTo(338, 392),
		(ctx) => ctx.lineTo(432, 482),
		(ctx) => ctx.lineTo(526, 426),
		(ctx) => ctx.lineTo(627, 487),
		(ctx) => ctx.lineTo(706, 417),
		(ctx) => ctx.lineTo(798, 478),
		(ctx) => ctx.lineTo(894, 405),
		(ctx) => ctx.lineTo(982, 466),
		(ctx) => ctx.lineTo(1068, 421),
		(ctx) => ctx.lineTo(1148, 493),
	]);
	context.stroke();

	context.strokeStyle = "rgba(45, 72, 66, 0.7)";
	context.lineWidth = 2;
	for (const [x, y, scale] of [
		[432, 292, 1],
		[455, 280, 0.72],
		[484, 298, 0.55],
	] as const) {
		path(context, [
			(ctx) => ctx.moveTo(x - 10 * scale, y),
			(ctx) => ctx.quadraticCurveTo(x - 4 * scale, y - 6 * scale, x, y),
			(ctx) =>
				ctx.quadraticCurveTo(x + 5 * scale, y - 6 * scale, x + 11 * scale, y),
		]);
		context.stroke();
	}
};

const drawCloud = (
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale: number,
) => {
	context.save();
	context.translate(x, y);
	context.scale(scale, scale);

	path(context, [
		(ctx) => ctx.moveTo(-76, 24),
		(ctx) => ctx.bezierCurveTo(-100, 4, -76, -30, -42, -23),
		(ctx) => ctx.bezierCurveTo(-38, -62, 14, -73, 32, -38),
		(ctx) => ctx.bezierCurveTo(66, -61, 99, -29, 81, 4),
		(ctx) => ctx.bezierCurveTo(124, 9, 118, 48, 78, 47),
		(ctx) => ctx.bezierCurveTo(20, 58, -44, 55, -76, 24),
		(ctx) => ctx.closePath(),
	]);
	const fill = context.createLinearGradient(0, -56, 0, 55);
	fill.addColorStop(0, "#fffdf4");
	fill.addColorStop(0.7, "#f6edda");
	fill.addColorStop(1, "#decfb7");
	context.fillStyle = fill;
	context.fill();
	context.strokeStyle = "rgba(105, 101, 89, 0.28)";
	context.lineWidth = 1.3;
	context.stroke();

	path(context, [
		(ctx) => ctx.moveTo(-54, 28),
		(ctx) => ctx.bezierCurveTo(-16, 44, 39, 43, 75, 25),
		(ctx) => ctx.bezierCurveTo(44, 58, -19, 58, -54, 28),
	]);
	context.fillStyle = "rgba(128, 116, 98, 0.13)";
	context.fill();

	// Folded-in creases.
	context.strokeStyle = "rgba(145, 132, 111, 0.28)";
	context.lineWidth = 1;
	path(context, [
		(ctx) => ctx.moveTo(-25, -22),
		(ctx) => ctx.quadraticCurveTo(-10, 8, -26, 29),
	]);
	context.stroke();
	path(context, [
		(ctx) => ctx.moveTo(37, -28),
		(ctx) => ctx.quadraticCurveTo(25, 5, 36, 32),
	]);
	context.stroke();
	context.restore();
};

const drawClouds = (context: CanvasRenderingContext2D) => {
	drawCloud(context, 226, 272, 1.02);
	drawCloud(context, 493, 222, 0.62);
	drawCloud(context, 875, 249, 1.15);
	drawCloud(context, 1080, 198, 0.48);

	// A few loose paper dots make the cloud bank feel hand cut.
	context.fillStyle = "rgba(255, 250, 238, 0.45)";
	for (const [x, y, radius] of [
		[166, 330, 4],
		[196, 347, 2.4],
		[720, 310, 3.6],
		[1003, 330, 3],
		[1028, 346, 1.8],
	] as const) {
		path(context, [
			(ctx) => ctx.arc(x, y, radius, 0, Math.PI * 2),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}
};

const drawPine = (
	context: CanvasRenderingContext2D,
	x: number,
	baseY: number,
	height: number,
	width: number,
	dark: string,
	light: string,
) => {
	// Trunk.
	const trunk = context.createLinearGradient(x - 12, 0, x + 14, 0);
	trunk.addColorStop(0, "#624b3b");
	trunk.addColorStop(0.55, "#45352c");
	trunk.addColorStop(1, "#2c2624");
	path(context, [
		(ctx) => ctx.moveTo(x - width * 0.07, baseY),
		(ctx) => ctx.lineTo(x - width * 0.035, baseY - height * 0.44),
		(ctx) => ctx.lineTo(x + width * 0.04, baseY - height * 0.44),
		(ctx) => ctx.lineTo(x + width * 0.08, baseY),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = trunk;
	context.fill();

	for (let tier = 0; tier < 4; tier++) {
		const tierBase = baseY - height * (0.16 + tier * 0.18);
		const tierTop = tierBase - height * 0.36;
		const halfWidth = width * (0.5 - tier * 0.09);
		path(context, [
			(ctx) => ctx.moveTo(x, tierTop),
			(ctx) => ctx.lineTo(x - halfWidth, tierBase),
			(ctx) => ctx.lineTo(x - halfWidth * 0.52, tierBase - height * 0.035),
			(ctx) => ctx.lineTo(x - halfWidth * 0.16, tierBase - height * 0.01),
			(ctx) => ctx.lineTo(x, tierBase - height * 0.045),
			(ctx) => ctx.lineTo(x + halfWidth * 0.2, tierBase - height * 0.008),
			(ctx) => ctx.lineTo(x + halfWidth * 0.56, tierBase - height * 0.038),
			(ctx) => ctx.lineTo(x + halfWidth, tierBase),
			(ctx) => ctx.closePath(),
		]);
		context.fillStyle = dark;
		context.fill();

		path(context, [
			(ctx) => ctx.moveTo(x, tierTop),
			(ctx) => ctx.lineTo(x - halfWidth, tierBase),
			(ctx) => ctx.lineTo(x - halfWidth * 0.44, tierBase - height * 0.03),
			(ctx) => ctx.lineTo(x, tierBase - height * 0.045),
			(ctx) => ctx.closePath(),
		]);
		context.fillStyle = light;
		context.globalAlpha = 0.48;
		context.fill();
		context.globalAlpha = 1;

		context.strokeStyle = "rgba(16, 46, 38, 0.35)";
		context.lineWidth = 1;
		path(context, [
			(ctx) => ctx.moveTo(x, tierTop),
			(ctx) => ctx.lineTo(x + halfWidth, tierBase),
		]);
		context.stroke();
	}
};

const drawTrees = (context: CanvasRenderingContext2D) => {
	const ground = context.createLinearGradient(0, 492, 0, 610);
	ground.addColorStop(0, "#4f7659");
	ground.addColorStop(0.55, "#315b49");
	ground.addColorStop(1, "#1c3d35");
	path(context, [
		(ctx) => ctx.moveTo(40, 552),
		(ctx) => ctx.bezierCurveTo(168, 511, 296, 546, 426, 554),
		(ctx) => ctx.bezierCurveTo(524, 560, 686, 561, 788, 546),
		(ctx) => ctx.bezierCurveTo(893, 530, 1022, 518, 1162, 555),
		(ctx) => ctx.lineTo(1162, 636),
		(ctx) => ctx.lineTo(40, 636),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = ground;
	context.fill();

	// A paler paper hill behind the trees.
	path(context, [
		(ctx) => ctx.moveTo(44, 549),
		(ctx) => ctx.bezierCurveTo(174, 487, 322, 516, 456, 531),
		(ctx) => ctx.bezierCurveTo(558, 543, 691, 540, 793, 527),
		(ctx) => ctx.bezierCurveTo(908, 512, 1037, 495, 1156, 533),
		(ctx) => ctx.lineTo(1156, 560),
		(ctx) => ctx.bezierCurveTo(1000, 534, 893, 548, 778, 558),
		(ctx) => ctx.bezierCurveTo(650, 569, 530, 566, 430, 558),
		(ctx) => ctx.bezierCurveTo(294, 548, 180, 530, 44, 567),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = "rgba(118, 151, 112, 0.36)";
	context.fill();

	drawPine(context, 192, 579, 260, 184, "#173f35", "#4e8a63");
	drawPine(context, 1012, 584, 282, 202, "#14392f", "#4d8761");
	drawPine(context, 316, 582, 158, 112, "#1e4b3d", "#5a8f67");
	drawPine(context, 874, 580, 172, 124, "#1b4639", "#578b66");
	drawPine(context, 1101, 579, 170, 118, "#1a4437", "#4e825d");

	// Low shrubs overlap the foreground and hide the tree roots.
	for (const [x, y, radius, alpha] of [
		[118, 586, 52, 0.92],
		[175, 598, 48, 0.85],
		[284, 590, 38, 0.8],
		[808, 592, 42, 0.82],
		[952, 598, 57, 0.9],
		[1082, 590, 46, 0.86],
	] as const) {
		context.save();
		context.globalAlpha = alpha;
		path(context, [
			(ctx) => ctx.arc(x, y, radius, Math.PI, Math.PI * 2),
			(ctx) => ctx.quadraticCurveTo(x, y + radius * 0.5, x - radius, y),
			(ctx) => ctx.closePath(),
		]);
		const shrub = context.createLinearGradient(x, y - radius, x, y + 12);
		shrub.addColorStop(0, "#376b4e");
		shrub.addColorStop(1, "#183d32");
		context.fillStyle = shrub;
		context.fill();
		context.restore();
	}

	// Grass blades and tiny flowers are simple cut-paper strokes.
	context.strokeStyle = "rgba(141, 183, 128, 0.62)";
	context.lineWidth = 1.4;
	context.lineCap = "round";
	for (let index = 0; index < 34; index++) {
		const x = 86 + ((index * 97) % 1020);
		const y = 568 + ((index * 31) % 38);
		const lean = ((index % 5) - 2) * 5;
		path(context, [
			(ctx) => ctx.moveTo(x, y),
			(ctx) => ctx.quadraticCurveTo(x + lean, y - 12, x + lean * 1.7, y - 21),
		]);
		context.stroke();
	}
	context.fillStyle = "#f0c47b";
	for (let index = 0; index < 12; index++) {
		const x = 150 + ((index * 83) % 890);
		const y = 570 + ((index * 19) % 28);
		path(context, [
			(ctx) => ctx.arc(x, y, 2.3, 0, Math.PI * 2),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}
};

const drawCharacter = (context: CanvasRenderingContext2D) => {
	// Backpack behind the shoulders.
	path(context, [
		(ctx) => ctx.moveTo(616, 447),
		(ctx) => ctx.quadraticCurveTo(653, 440, 660, 478),
		(ctx) => ctx.lineTo(654, 520),
		(ctx) => ctx.quadraticCurveTo(632, 530, 617, 515),
		(ctx) => ctx.closePath(),
	]);
	const pack = context.createLinearGradient(620, 445, 662, 520);
	pack.addColorStop(0, "#3d7b74");
	pack.addColorStop(1, "#24534f");
	context.fillStyle = pack;
	context.fill();
	context.strokeStyle = "rgba(15, 44, 44, 0.45)";
	context.lineWidth = 1.2;
	context.stroke();
	path(context, [
		(ctx) => ctx.moveTo(628, 459),
		(ctx) => ctx.quadraticCurveTo(643, 474, 649, 501),
	]);
	context.strokeStyle = "rgba(210, 235, 216, 0.36)";
	context.stroke();

	// Legs and boots.
	context.lineCap = "round";
	context.strokeStyle = "#263847";
	context.lineWidth = 16;
	path(context, [
		(ctx) => ctx.moveTo(584, 514),
		(ctx) => ctx.quadraticCurveTo(578, 534, 574, 551),
	]);
	context.stroke();
	path(context, [
		(ctx) => ctx.moveTo(616, 514),
		(ctx) => ctx.quadraticCurveTo(624, 535, 626, 551),
	]);
	context.stroke();
	context.fillStyle = "#322c32";
	for (const x of [574, 626]) {
		path(context, [
			(ctx) => ctx.moveTo(x - 11, 548),
			(ctx) => ctx.quadraticCurveTo(x - 3, 542, x + 9, 548),
			(ctx) => ctx.lineTo(x + 12, 560),
			(ctx) => ctx.quadraticCurveTo(x, 566, x - 14, 559),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}

	// Arms, painted as tapered paper strips.
	context.strokeStyle = "#a8443b";
	context.lineWidth = 18;
	path(context, [
		(ctx) => ctx.moveTo(568, 451),
		(ctx) => ctx.quadraticCurveTo(543, 466, 535, 495),
	]);
	context.stroke();
	path(context, [
		(ctx) => ctx.moveTo(631, 452),
		(ctx) => ctx.quadraticCurveTo(656, 462, 668, 487),
	]);
	context.stroke();
	context.fillStyle = "#e4b08a";
	for (const [x, y] of [
		[533, 499],
		[670, 491],
	] as const) {
		path(context, [
			(ctx) => ctx.arc(x, y, 8, 0, Math.PI * 2),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}

	// Coat.
	path(context, [
		(ctx) => ctx.moveTo(565, 448),
		(ctx) => ctx.quadraticCurveTo(579, 430, 600, 430),
		(ctx) => ctx.quadraticCurveTo(622, 430, 636, 448),
		(ctx) => ctx.lineTo(644, 507),
		(ctx) => ctx.quadraticCurveTo(632, 522, 600, 524),
		(ctx) => ctx.quadraticCurveTo(568, 522, 556, 507),
		(ctx) => ctx.closePath(),
	]);
	const coat = context.createLinearGradient(556, 430, 644, 520);
	coat.addColorStop(0, "#df725d");
	coat.addColorStop(0.58, "#c95448");
	coat.addColorStop(1, "#a63f3a");
	context.fillStyle = coat;
	context.fill();
	context.strokeStyle = "rgba(110, 46, 42, 0.5)";
	context.lineWidth = 1.4;
	context.stroke();

	// The left half catches more light and gets a paper fold.
	path(context, [
		(ctx) => ctx.moveTo(578, 438),
		(ctx) => ctx.lineTo(572, 510),
		(ctx) => ctx.quadraticCurveTo(585, 518, 598, 519),
		(ctx) => ctx.lineTo(595, 438),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = "rgba(255, 191, 144, 0.22)";
	context.fill();
	path(context, [
		(ctx) => ctx.moveTo(601, 435),
		(ctx) => ctx.quadraticCurveTo(610, 472, 605, 520),
	]);
	context.strokeStyle = "rgba(96, 39, 38, 0.34)";
	context.lineWidth = 1;
	context.stroke();

	// Buttons and pocket.
	context.fillStyle = "#f0c28a";
	for (const y of [462, 484]) {
		path(context, [
			(ctx) => ctx.arc(600, y, 3.2, 0, Math.PI * 2),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}
	path(context, [
		(ctx) => ctx.moveTo(613, 480),
		(ctx) => ctx.lineTo(630, 482),
		(ctx) => ctx.quadraticCurveTo(628, 494, 616, 495),
	]);
	context.strokeStyle = "rgba(108, 45, 41, 0.42)";
	context.stroke();

	// Scarf and its flying tail.
	path(context, [
		(ctx) => ctx.moveTo(566, 441),
		(ctx) => ctx.quadraticCurveTo(600, 453, 635, 441),
		(ctx) => ctx.quadraticCurveTo(633, 458, 602, 459),
		(ctx) => ctx.quadraticCurveTo(573, 458, 563, 450),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = "#e9a548";
	context.fill();
	path(context, [
		(ctx) => ctx.moveTo(571, 449),
		(ctx) => ctx.bezierCurveTo(541, 449, 529, 463, 502, 451),
		(ctx) => ctx.bezierCurveTo(522, 476, 548, 475, 566, 463),
		(ctx) => ctx.closePath(),
	]);
	const scarf = context.createLinearGradient(500, 448, 570, 470);
	scarf.addColorStop(0, "#f2c06a");
	scarf.addColorStop(1, "#d88d39");
	context.fillStyle = scarf;
	context.fill();
	context.strokeStyle = "rgba(145, 83, 31, 0.4)";
	context.lineWidth = 1;
	context.stroke();

	// Head.
	const skin = context.createRadialGradient(592, 397, 5, 600, 414, 38);
	skin.addColorStop(0, "#f9dfc3");
	skin.addColorStop(0.7, "#edc39d");
	skin.addColorStop(1, "#d8a479");
	path(context, [
		(ctx) => ctx.arc(600, 408, 31, 0, Math.PI * 2),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = skin;
	context.fill();
	context.strokeStyle = "rgba(135, 85, 58, 0.42)";
	context.lineWidth = 1.2;
	context.stroke();

	// Hair.
	path(context, [
		(ctx) => ctx.moveTo(569, 405),
		(ctx) => ctx.bezierCurveTo(566, 378, 579, 367, 598, 369),
		(ctx) => ctx.bezierCurveTo(618, 365, 633, 378, 631, 405),
		(ctx) => ctx.quadraticCurveTo(619, 391, 604, 394),
		(ctx) => ctx.quadraticCurveTo(587, 390, 569, 405),
		(ctx) => ctx.closePath(),
	]);
	const hair = context.createLinearGradient(568, 369, 630, 407);
	hair.addColorStop(0, "#724a3c");
	hair.addColorStop(1, "#3b2a2c");
	context.fillStyle = hair;
	context.fill();
	path(context, [
		(ctx) => ctx.moveTo(572, 393),
		(ctx) => ctx.quadraticCurveTo(582, 379, 597, 383),
		(ctx) => ctx.quadraticCurveTo(611, 376, 624, 389),
	]);
	context.strokeStyle = "rgba(255, 219, 176, 0.28)";
	context.lineWidth = 2;
	context.stroke();

	// Face.
	context.fillStyle = "#41312e";
	path(context, [
		(ctx) => ctx.arc(589, 411, 2.1, 0, Math.PI * 2),
		(ctx) => ctx.closePath(),
	]);
	context.fill();
	path(context, [
		(ctx) => ctx.arc(610, 411, 2.1, 0, Math.PI * 2),
		(ctx) => ctx.closePath(),
	]);
	context.fill();
	path(context, [
		(ctx) => ctx.moveTo(592, 423),
		(ctx) => ctx.quadraticCurveTo(600, 429, 609, 422),
	]);
	context.strokeStyle = "rgba(95, 54, 43, 0.8)";
	context.lineWidth = 1.8;
	context.lineCap = "round";
	context.stroke();
	context.fillStyle = "rgba(218, 113, 102, 0.28)";
	for (const x of [582, 618]) {
		path(context, [
			(ctx) => ctx.ellipse(x, 419, 5, 3, 0, 0, Math.PI * 2),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}

	// A small paper badge on the coat.
	path(context, [
		(ctx) => ctx.moveTo(625, 462),
		(ctx) => ctx.lineTo(633, 465),
		(ctx) => ctx.lineTo(631, 474),
		(ctx) => ctx.lineTo(624, 476),
		(ctx) => ctx.lineTo(621, 468),
		(ctx) => ctx.closePath(),
	]);
	context.fillStyle = "#f4d18e";
	context.fill();
};

const makeLayer = (
	draw: (context: CanvasRenderingContext2D) => void,
): LayerArt => {
	const content = makeCanvas();
	const context = contextFor(content);
	context.save();
	draw(context);
	context.restore();

	const silhouette = makeCanvas();
	const silhouetteContext = contextFor(silhouette);
	silhouetteContext.drawImage(content, 0, 0);
	silhouetteContext.globalCompositeOperation = "source-in";
	silhouetteContext.fillStyle = "#fff3d6";
	silhouetteContext.fillRect(0, 0, SCENE_WIDTH, SCENE_HEIGHT);

	return { content, silhouette };
};

const drawGrain = (context: CanvasRenderingContext2D) => {
	let seed = 9127;
	const random = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 0xffffffff;
	};
	for (let index = 0; index < 1250; index++) {
		const x = random() * SCENE_WIDTH;
		const y = random() * SCENE_HEIGHT;
		const length = 1 + random() * 8;
		context.strokeStyle =
			index % 4 === 0 ? "rgba(255, 250, 232, 0.09)" : "rgba(53, 43, 34, 0.055)";
		context.lineWidth = 0.55 + random() * 0.5;
		path(context, [
			(ctx) => ctx.moveTo(x, y),
			(ctx) => ctx.lineTo(x + length, y + (random() - 0.5) * 1.4),
		]);
		context.stroke();
	}
	for (let index = 0; index < 280; index++) {
		context.fillStyle = "rgba(48, 39, 31, 0.06)";
		path(context, [
			(ctx) =>
				ctx.arc(
					random() * SCENE_WIDTH,
					random() * SCENE_HEIGHT,
					0.8,
					0,
					Math.PI * 2,
				),
			(ctx) => ctx.closePath(),
		]);
		context.fill();
	}
};

export const createSceneCaches = (): SceneCaches => {
	const layers = {
		mountains: makeLayer(drawMountains),
		clouds: makeLayer(drawClouds),
		trees: makeLayer(drawTrees),
		character: makeLayer(drawCharacter),
	};

	const grain = makeCanvas();
	drawGrain(contextFor(grain));

	return { layers, grain };
};
