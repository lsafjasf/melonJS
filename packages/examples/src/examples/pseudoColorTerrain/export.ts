/**
 * melonJS — pseudo-colour terrain: annotated PNG export.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 */

import {
	CHANNELS,
	channelColor,
	type EditorState,
	histogram,
	makeCurveLut,
	type ProcessedImage,
} from "./process";
import type { Terrain } from "./terrain";

const EXPORT_WIDTH = 1600;
const EXPORT_HEIGHT = 1180;
const IMAGE_X = 64;
const IMAGE_Y = 168;
const IMAGE_SIZE = 672;
const PANEL_X = 784;
const PANEL_W = 752;
const PANEL_H = 144;
const PANEL_GAP = 18;

const roundedRect = (
	context: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) => {
	context.beginPath();
	context.roundRect(x, y, width, height, radius);
};

const drawHistogram = (
	context: CanvasRenderingContext2D,
	terrain: Terrain,
	state: EditorState,
	channelIndex: number,
	x: number,
	y: number,
	width: number,
	height: number,
) => {
	const channel = CHANNELS[channelIndex];
	const bandIndex = state.assignments[channelIndex];
	const band = terrain.bands[bandIndex];
	const color = channelColor(channel);
	const { counts, peak } = histogram(band, 96);

	context.save();
	context.fillStyle = "#10161c";
	roundedRect(context, x, y, width, height, 7);
	context.fill();
	context.strokeStyle = "rgba(255,255,255,0.08)";
	context.lineWidth = 1;
	context.stroke();

	context.fillStyle = color;
	context.font = "700 18px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(channel, x + 18, y + 28);
	context.fillStyle = "#dbe5eb";
	context.font = "500 13px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(
		`←  BAND 0${band.index}  ·  ${band.name.toUpperCase()}`,
		x + 42,
		y + 28,
	);

	const graphX = x + 18;
	const graphY = y + 42;
	const graphW = width - 36;
	const graphH = height - 58;
	context.strokeStyle = "rgba(255,255,255,0.075)";
	context.lineWidth = 1;
	for (let i = 1; i < 4; i++) {
		const gy = graphY + (graphH * i) / 4;
		context.beginPath();
		context.moveTo(graphX, gy);
		context.lineTo(graphX + graphW, gy);
		context.stroke();
	}

	for (let index = 0; index < counts.length; index++) {
		const barX = graphX + (index / counts.length) * graphW;
		const barW = Math.max(1, graphW / counts.length + 0.5);
		const level = Math.sqrt(counts[index] / peak);
		const barH = Math.max(1, level * graphH);
		const alpha = 0.34 + level * 0.56;
		context.fillStyle = `${color}${Math.round(alpha * 255)
			.toString(16)
			.padStart(2, "0")}`;
		context.fillRect(barX, graphY + graphH - barH, barW, barH);
	}

	if (channelIndex < 3) {
		const lut = makeCurveLut(state.curves[channel as "R" | "G" | "B"]);
		context.strokeStyle = "#eef6f9";
		context.lineWidth = 1.6;
		context.beginPath();
		for (let step = 0; step < 256; step++) {
			const px = graphX + (step / 255) * graphW;
			const py = graphY + graphH - (lut[step] / 255) * graphH;
			if (step === 0) {
				context.moveTo(px, py);
			} else {
				context.lineTo(px, py);
			}
		}
		context.stroke();
	}

	context.fillStyle = "rgba(255,255,255,0.45)";
	context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText("0", graphX, y + height - 6);
	context.textAlign = "right";
	context.fillText("255", graphX + graphW, y + height - 6);
	context.restore();
};

const drawLegend = (
	context: CanvasRenderingContext2D,
	terrain: Terrain,
	state: EditorState,
	presetName: string,
) => {
	const x = 64;
	const y = 866;
	const width = EXPORT_WIDTH - 128;
	const height = 214;
	context.fillStyle = "#0e141a";
	roundedRect(context, x, y, width, height, 8);
	context.fill();
	context.strokeStyle = "rgba(255,255,255,0.08)";
	context.stroke();

	context.fillStyle = "#8ba0ad";
	context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText("CHANNEL LEGEND", x + 22, y + 30);
	context.fillStyle = "#eef4f7";
	context.font = "600 14px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.textAlign = "right";
	context.fillText(
		`${presetName.toUpperCase()}  ·  3 TONE CURVES`,
		x + width - 22,
		y + 30,
	);
	context.textAlign = "left";

	const itemWidth = (width - 44) / 4;
	CHANNELS.forEach((channel, index) => {
		const ix = x + 22 + itemWidth * index;
		const band = terrain.bands[state.assignments[index]];
		const color = channelColor(channel);
		context.fillStyle = color;
		context.fillRect(ix, y + 58, 4, 102);
		context.font = "700 20px ui-monospace, SFMono-Regular, Menlo, monospace";
		context.fillText(
			channel + (channel === "A" ? " / EXTRA" : ""),
			ix + 18,
			y + 78,
		);
		context.fillStyle = "#dce7ec";
		context.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
		context.fillText(
			`BAND 0${band.index}  ·  ${band.name.toUpperCase()}`,
			ix + 18,
			y + 101,
		);
		context.fillStyle = "#7f949f";
		context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
		const curve =
			channel === "R"
				? state.curves.R
				: channel === "G"
					? state.curves.G
					: channel === "B"
						? state.curves.B
						: null;
		context.fillText(
			curve
				? `curve  ${curve.map((value) => value.toFixed(2)).join(" / ")}`
				: "extra channel  ·  alpha",
			ix + 18,
			y + 127,
		);
		context.fillStyle = "rgba(255,255,255,0.4)";
		context.fillText(
			`raw ${band.min.toFixed(2)}–${band.max.toFixed(2)}  ·  mean ${band.mean.toFixed(2)}`,
			ix + 18,
			y + 148,
		);
	});

	context.fillStyle = "rgba(255,255,255,0.055)";
	context.fillRect(x + 22, y + 164, width - 44, 1);
	context.fillStyle = "#7f949f";
	context.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(
		"Four procedurally generated bands · RGB tone curves applied in the CPU compositor · A receives the fourth band",
		x + 22,
		y + 189,
	);
};

export const buildExportCanvas = (
	terrain: Terrain,
	state: EditorState,
	image: ProcessedImage,
	presetName: string,
) => {
	const canvas = document.createElement("canvas");
	canvas.width = EXPORT_WIDTH;
	canvas.height = EXPORT_HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Could not create the export canvas");
	}

	context.fillStyle = "#090d11";
	context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);
	context.fillStyle = "rgba(30,52,66,0.15)";
	context.fillRect(0, 0, EXPORT_WIDTH, EXPORT_HEIGHT);

	context.fillStyle = "#f2f7f9";
	context.font = "700 42px system-ui, -apple-system, Segoe UI, sans-serif";
	context.fillText("PSEUDO-COLOUR TERRAIN", 64, 72);
	context.fillStyle = "#8ea2ae";
	context.font = "13px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(
		`SEED ${terrain.seedText}  ·  ${terrain.size} × ${terrain.size}  ·  ${presetName.toUpperCase()}  ·  CPU PIXEL COMPOSITE`,
		66,
		99,
	);
	context.fillStyle = "#50d98a";
	context.fillRect(64, 120, 6, 6);
	context.fillStyle = "#7f949f";
	context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText("EIGHT-BIT sRGB  /  RGBA OUTPUT", 78, 127);

	context.fillStyle = "#06090c";
	context.fillRect(IMAGE_X - 8, IMAGE_Y - 8, IMAGE_SIZE + 16, IMAGE_SIZE + 16);
	context.strokeStyle = "rgba(255,255,255,0.12)";
	context.strokeRect(
		IMAGE_X - 7.5,
		IMAGE_Y - 7.5,
		IMAGE_SIZE + 15,
		IMAGE_SIZE + 15,
	);
	const composite = document.createElement("canvas");
	composite.width = image.width;
	composite.height = image.height;
	const compositeContext = composite.getContext("2d");
	if (compositeContext) {
		compositeContext.putImageData(
			new ImageData(image.pixels, image.width, image.height),
			0,
			0,
		);
	}
	context.imageSmoothingEnabled = true;
	context.drawImage(composite, IMAGE_X, IMAGE_Y, IMAGE_SIZE, IMAGE_SIZE);

	context.fillStyle = "rgba(3,7,10,0.74)";
	context.fillRect(IMAGE_X + 16, IMAGE_Y + IMAGE_SIZE - 42, 286, 26);
	context.fillStyle = "#eaf2f5";
	context.font = "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(
		`FALSE COLOUR  ·  R${state.assignments[0]} G${state.assignments[1]} B${state.assignments[2]} A${state.assignments[3]}`,
		IMAGE_X + 27,
		IMAGE_Y + IMAGE_SIZE - 24,
	);

	for (let index = 0; index < 4; index++) {
		drawHistogram(
			context,
			terrain,
			state,
			index,
			PANEL_X,
			IMAGE_Y + index * (PANEL_H + PANEL_GAP),
			PANEL_W,
			PANEL_H,
		);
	}

	drawLegend(context, terrain, state, presetName);
	context.fillStyle = "#607784";
	context.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
	context.fillText(
		"TERRA COLOUR LAB  ·  melonJS example  ·  deterministic procedural survey",
		64,
		1124,
	);
	context.textAlign = "right";
	context.fillText(
		"Histograms show the assigned raw band · white lines are the applied RGB curves",
		EXPORT_WIDTH - 64,
		1124,
	);
	context.textAlign = "left";
	return canvas;
};

export const downloadExport = (
	terrain: Terrain,
	state: EditorState,
	image: ProcessedImage,
	presetName: string,
) => {
	const canvas = buildExportCanvas(terrain, state, image, presetName);
	return new Promise<void>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) {
				reject(new Error("The export canvas could not be encoded as PNG"));
				return;
			}
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `pseudo-color-terrain-${terrain.seedText.replace(/[^\w-]+/g, "_")}.png`;
			anchor.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			resolve();
		}, "image/png");
	});
};
