/**
 * melonJS — Tidal Crystals example.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 */

import { type LightMode, MODE_ACCENT, MODE_LABEL } from "./palette";

export interface CaptureInfo {
	fps: number;
	tide: number;
	mode: LightMode;
	paused: boolean;
}

const roundedRect = (
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) => {
	ctx.beginPath();
	ctx.roundRect(x, y, width, height, radius);
	ctx.fill();
};

const drawMetric = (
	ctx: CanvasRenderingContext2D,
	x: number,
	label: string,
	value: string,
	accent: string,
) => {
	ctx.fillStyle = "rgba(5, 13, 18, 0.62)";
	roundedRect(ctx, x, 30, 142, 66, 10);
	ctx.strokeStyle = "rgba(205, 245, 255, 0.16)";
	ctx.lineWidth = 1;
	ctx.strokeRect(x + 0.5, 30.5, 141, 65);
	ctx.fillStyle = accent;
	ctx.fillRect(x + 16, 44, 22, 2);
	ctx.fillStyle = "rgba(214, 240, 245, 0.62)";
	ctx.font = "600 10px Arial, sans-serif";
	ctx.fillText(label, x + 16, 59);
	ctx.fillStyle = "rgba(240, 250, 252, 0.96)";
	ctx.font = "700 21px Arial, sans-serif";
	ctx.fillText(value, x + 16, 83);
};

/**
 * Compose the live scene and the DOM HUD into one self-contained PNG. The
 * caller renders the WebGL frame immediately before this function, so the
 * canvas still holds that frame even without preserveDrawingBuffer.
 */
export const composeCapture = (
	source: HTMLCanvasElement,
	info: CaptureInfo,
): Promise<Blob> => {
	const output = document.createElement("canvas");
	output.width = source.width;
	output.height = source.height;
	const ctx = output.getContext("2d");
	if (!ctx) {
		return Promise.reject(new Error("Unable to create screenshot canvas"));
	}
	ctx.drawImage(source, 0, 0);

	const width = output.width;
	const scale = width / 1280;
	ctx.save();
	ctx.scale(scale, scale);
	const accent = MODE_ACCENT[info.mode];

	const vignette = ctx.createRadialGradient(640, 360, 310, 640, 360, 760);
	vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
	vignette.addColorStop(1, "rgba(0, 6, 12, 0.48)");
	ctx.fillStyle = vignette;
	ctx.fillRect(0, 0, 1280, 720);

	ctx.fillStyle = "rgba(4, 12, 17, 0.58)";
	roundedRect(ctx, 30, 30, 332, 92, 12);
	ctx.strokeStyle = "rgba(205, 245, 255, 0.14)";
	ctx.lineWidth = 1;
	ctx.strokeRect(30.5, 30.5, 331, 91);
	ctx.fillStyle = accent;
	ctx.fillRect(52, 51, 4, 50);
	ctx.fillStyle = "rgba(205, 240, 244, 0.58)";
	ctx.font = "600 10px Arial, sans-serif";
	ctx.fillText("PROCEDURAL TIDE STUDY  /  01", 72, 56);
	ctx.fillStyle = "rgba(246, 252, 252, 0.98)";
	ctx.font = "700 30px Arial, sans-serif";
	ctx.fillText("TIDAL CRYSTALS", 72, 84);
	ctx.fillStyle = "rgba(198, 231, 236, 0.56)";
	ctx.font = "500 10px Arial, sans-serif";
	ctx.fillText("WEBGL 2 · GENERATED GEOMETRY · NO TEXTURES", 72, 105);

	drawMetric(ctx, 986, "FRAME RATE", `${Math.round(info.fps)} FPS`, accent);
	drawMetric(ctx, 1112, "TIDE LEVEL", `${info.tide.toFixed(1)} m`, accent);

	const lightValue = MODE_LABEL[info.mode];
	ctx.fillStyle = "rgba(5, 13, 18, 0.62)";
	roundedRect(ctx, 936, 108, 318, 52, 10);
	ctx.fillStyle = accent;
	ctx.fillRect(952, 123, 22, 2);
	ctx.fillStyle = "rgba(214, 240, 245, 0.62)";
	ctx.font = "600 10px Arial, sans-serif";
	ctx.fillText("LIGHT MODE", 952, 138);
	ctx.fillStyle = accent;
	ctx.font = "700 18px Arial, sans-serif";
	ctx.fillText(lightValue.toUpperCase(), 1060, 140);

	const controls =
		"DRAG  ORBIT     WHEEL  TIDE     1  NOON     2  DUSK     3  NIGHT     P  PAUSE     C  CAPTURE";
	ctx.font = "500 11px Arial, sans-serif";
	const controlsWidth = ctx.measureText(controls).width;
	ctx.fillStyle = "rgba(4, 12, 17, 0.55)";
	roundedRect(
		ctx,
		640 - controlsWidth / 2 - 26,
		657,
		controlsWidth + 52,
		34,
		17,
	);
	ctx.fillStyle = "rgba(211, 240, 244, 0.7)";
	ctx.fillText(controls, 640 - controlsWidth / 2, 678);

	if (info.paused) {
		ctx.fillStyle = "rgba(3, 9, 13, 0.44)";
		ctx.fillRect(0, 0, 1280, 720);
		ctx.textAlign = "center";
		ctx.fillStyle = "rgba(235, 250, 250, 0.95)";
		ctx.font = "700 13px Arial, sans-serif";
		ctx.fillText("TIDE HELD", 640, 348);
		ctx.fillStyle = "rgba(195, 234, 238, 0.6)";
		ctx.font = "500 10px Arial, sans-serif";
		ctx.fillText("MOTION + AUDIO PAUSED", 640, 370);
		ctx.textAlign = "left";
	}

	ctx.restore();
	return new Promise((resolve, reject) => {
		output.toBlob((blob) => {
			if (blob) {
				resolve(blob);
			} else {
				reject(new Error("Unable to encode screenshot"));
			}
		}, "image/png");
	});
};
