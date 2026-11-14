/**
 * melonJS — atlas packer: canvas image helpers.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 * See `packages/examples/LICENSE.md` for full license + asset credits.
 *
 * Everything that touches a 2D canvas lives here: the 40 procedurally
 * generated sample icons, alpha trimming (the trim never removes a
 * non-transparent pixel), atlas compositing with rotation, and the
 * round-trip helper that restores a source image from an exported atlas.
 */

import type { ImageRecord, SliceRect, TrimRect } from "./metadata";
import type { PackedFrame } from "./packer";

/** a loaded source image with the pixels the trimmer measured */
export interface SourceImage {
	record: ImageRecord;
	/** the decoded image, at its original size */
	image: HTMLCanvasElement | HTMLImageElement;
}

/** a source plus its packed frame, ready to paint onto the atlas */
export interface CompositableImage {
	source: SourceImage;
	frame: PackedFrame;
}

/** deterministic PRNG so the built-in icons are identical on every load */
const seededRandom = (seed: number): (() => number) => {
	let state = seed % 2147483647;
	if (state <= 0) {
		state += 2147483646;
	}
	return () => {
		state = (state * 16807) % 2147483647;
		return (state - 1) / 2147483646;
	};
};

const makeCanvas = (width: number, height: number): HTMLCanvasElement => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

/**
 * Copy the trimmed crop out of a source image as raw pixels.
 * @param image - the source image
 * @param trim - the crop rectangle
 * @returns ImageData sized exactly to the crop
 */
const readCrop = (
	image: HTMLCanvasElement | HTMLImageElement,
	trim: TrimRect,
): ImageData => {
	const canvas = makeCanvas(trim.width, trim.height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("2D canvas context unavailable");
	}
	ctx.drawImage(
		image,
		trim.x,
		trim.y,
		trim.width,
		trim.height,
		0,
		0,
		trim.width,
		trim.height,
	);
	return ctx.getImageData(0, 0, trim.width, trim.height);
};

/**
 * Rotate raw crop pixels 90 degrees clockwise. A crop of w x h becomes
 * h x w, and crop pixel (x,y) moves to page pixel (h-1-y, x).
 * @param crop - the unrotated crop pixels
 * @returns the rotated pixels
 */
const rotateClockwise = (crop: ImageData): ImageData => {
	const w = crop.width;
	const h = crop.height;
	const rotated = new ImageData(h, w);
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const src = (y * w + x) * 4;
			const dst = (x * h + (h - 1 - y)) * 4;
			for (let channel = 0; channel < 4; channel++) {
				rotated.data[dst + channel] = crop.data[src + channel];
			}
		}
	}
	return rotated;
};

/**
 * Invert {@link rotateClockwise}: page footprint pixels (h x w) become a
 * w x h crop again. The forward map sends crop (x,y) to page (h-1-y, x),
 * so page pixel (u,v) returns to crop pixel (v, h-1-u).
 * @param page - the rotated pixels as stored in the atlas
 * @param width - the original crop width
 * @param height - the original crop height
 * @returns the unrotated crop pixels
 */
const rotateCounterClockwise = (
	page: ImageData,
	width: number,
	height: number,
): ImageData => {
	const crop = new ImageData(width, height);
	const w = width;
	const h = height;
	// the page is h wide and w tall; page pixel (u,v) returns to crop
	// pixel (v, h-1-u), the exact inverse of rotateClockwise.
	for (let v = 0; v < w; v++) {
		for (let u = 0; u < h; u++) {
			const src = (v * h + u) * 4;
			const cropX = v;
			const cropY = h - 1 - u;
			const dst = (cropY * w + cropX) * 4;
			for (let channel = 0; channel < 4; channel++) {
				crop.data[dst + channel] = page.data[src + channel];
			}
		}
	}
	return crop;
};

/**
 * Find the tightest rectangle containing every pixel whose alpha exceeds
 * a near-zero tolerance. Fully transparent images keep a 1×1 rect so they
 * still occupy a named frame.
 * @param image - the image to measure
 * @returns the trim rectangle
 */
export const measureTrim = (
	image: HTMLCanvasElement | HTMLImageElement,
): TrimRect => {
	const width = image.width;
	const height = image.height;
	const canvas = makeCanvas(width, height);
	const ctx = canvas.getContext("2d", { willReadFrequently: true });
	if (!ctx) {
		throw new Error("2D canvas context unavailable");
	}
	ctx.drawImage(image, 0, 0);
	const data = ctx.getImageData(0, 0, width, height).data;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	// Any non-zero alpha is content: a tolerance here would crop pixels the
	// source actually carries (soft shadow edges can be alpha 1..3), and the
	// round-trip contract forbids losing them. Fully transparent stays 0.
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 0) {
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	if (maxX < 0) {
		return { x: 0, y: 0, width: 1, height: 1 };
	}
	return {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
};

const SHAPES = ["circle", "square", "triangle", "diamond", "ring"] as const;
type Shape = (typeof SHAPES)[number];

/**
 * Generate the 40 built-in icons: 8 sizes (12–96 px) times 5 shapes,
 * each painted inside a transparent frame with a soft shadow, so trimming
 * has real work to do.
 * @returns 40 named source images
 */
export const generateSampleIcons = (): SourceImage[] => {
	const sizes = [12, 16, 24, 32, 48, 64, 80, 96];
	const icons: SourceImage[] = [];
	let index = 0;
	for (const size of sizes) {
		for (const shape of SHAPES) {
			const random = seededRandom(index + 1);
			const name = `icon-${String(index + 1).padStart(2, "0")}-${shape}-${size}.png`;
			// transparent padding around the glyph gives the trimmer edges
			const inset = Math.max(2, Math.round(size * 0.12));
			const canvas = makeCanvas(size, size);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				throw new Error("2D canvas context unavailable");
			}
			const hue = Math.floor(random() * 360);
			ctx.fillStyle = `hsl(${hue} 70% 55%)`;
			ctx.strokeStyle = `hsl(${(hue + 40) % 360} 80% 70%)`;
			ctx.lineWidth = Math.max(1, size * 0.08);
			ctx.shadowColor = `hsla(${hue} 70% 30% / 0.6)`;
			ctx.shadowBlur = Math.max(1, size * 0.06);
			ctx.shadowOffsetX = inset * 0.4;
			ctx.shadowOffsetY = inset * 0.4;
			paintShape(ctx, shape, inset, size - inset);
			const image = canvas;
			const trim = measureTrim(image);
			icons.push({
				record: {
					name,
					sourceWidth: size,
					sourceHeight: size,
					trim,
				},
				image,
			});
			index += 1;
		}
	}
	return icons;
};

const paintShape = (
	ctx: CanvasRenderingContext2D,
	shape: Shape,
	min: number,
	max: number,
): void => {
	const span = max - min;
	const cx = (min + max) / 2;
	const cy = (min + max) / 2;
	ctx.beginPath();
	switch (shape) {
		case "circle":
			ctx.arc(cx, cy, span / 2, 0, Math.PI * 2);
			ctx.fill();
			break;
		case "square":
			ctx.fillRect(min, min, span, span);
			break;
		case "triangle":
			ctx.moveTo(cx, min);
			ctx.lineTo(max, max);
			ctx.lineTo(min, max);
			ctx.closePath();
			ctx.fill();
			break;
		case "diamond":
			ctx.moveTo(cx, min);
			ctx.lineTo(max, cy);
			ctx.lineTo(cx, max);
			ctx.lineTo(min, cy);
			ctx.closePath();
			ctx.fill();
			break;
		case "ring":
			ctx.arc(cx, cy, span / 2, 0, Math.PI * 2);
			ctx.lineWidth = Math.max(1, span * 0.22);
			ctx.stroke();
			break;
	}
};

/**
 * Decode one user-selected PNG and measure its trim. The file never leaves
 * the browser.
 * @param file - a PNG (or other browser-decodable image) File
 * @returns a source image ready for packing
 */
export const loadImageFile = async (file: File): Promise<SourceImage> => {
	const url = URL.createObjectURL(file);
	try {
		const decoded = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () =>
				reject(new Error(`${file.name} is not an image the browser can read`));
			image.src = url;
		});
		const trim = measureTrim(decoded);
		return {
			record: {
				name: file.name,
				sourceWidth: decoded.width,
				sourceHeight: decoded.height,
				trim,
			},
			image: decoded,
		};
	} finally {
		URL.revokeObjectURL(url);
	}
};

/**
 * Composite every packed frame onto one transparent atlas canvas. Rotated
 * frames are painted with a 90-degree clockwise transform, matching the
 * `rotated: true` convention TexturePacker and melonJS expect.
 * @param images - the sources and their frames
 * @param width - atlas width
 * @param height - atlas height
 * @param margin - transparent border kept inside each frame
 * @returns the atlas canvas
 */
export const composeAtlas = (
	images: CompositableImage[],
	width: number,
	height: number,
	margin: number,
): HTMLCanvasElement => {
	const atlas = makeCanvas(width, height);
	const ctx = atlas.getContext("2d");
	if (!ctx) {
		throw new Error("2D canvas context unavailable");
	}
	for (const { source, frame } of images) {
		const { trim } = source.record;
		if (frame.rotated) {
			// frame rect on the page is trim.height wide and trim.width tall;
			// rotate the crop 90 degrees clockwise into that footprint.
			const crop = readCrop(source.image, trim);
			const rotated = rotateClockwise(crop);
			ctx.putImageData(rotated, frame.x + margin, frame.y + margin);
		} else {
			ctx.drawImage(
				source.image,
				trim.x,
				trim.y,
				trim.width,
				trim.height,
				frame.x + margin,
				frame.y + margin,
				trim.width,
				trim.height,
			);
		}
	}
	return atlas;
};

/**
 * Reconstruct one source image from an exported atlas: pull the crop back
 * out, un-rotate it, and place it at its original trim offset on a
 * full-size transparent canvas.
 * @param atlas - the exported atlas canvas/image
 * @param slice - the recovery descriptor from `slicesFromMetadata`
 * @returns a canvas the size of the original source image
 */
export const restoreSlice = (
	atlas: HTMLCanvasElement | HTMLImageElement,
	slice: SliceRect,
): HTMLCanvasElement => {
	const output = makeCanvas(slice.sourceSize.w, slice.sourceSize.h);
	const ctx = output.getContext("2d");
	if (!ctx) {
		throw new Error("2D canvas context unavailable");
	}
	const { source } = slice;
	if (slice.rotated) {
		// read the page footprint (h wide, w tall), then undo the clockwise
		// rotation pixel by pixel and place the crop at its trim offset.
		const pageCanvas = makeCanvas(source.height, source.width);
		const pageCtx = pageCanvas.getContext("2d", {
			willReadFrequently: true,
		});
		if (!pageCtx) {
			throw new Error("2D canvas context unavailable");
		}
		pageCtx.drawImage(
			atlas,
			slice.atlasX,
			slice.atlasY,
			source.height,
			source.width,
			0,
			0,
			source.height,
			source.width,
		);
		const page = pageCtx.getImageData(0, 0, source.height, source.width);
		const crop = rotateCounterClockwise(page, source.width, source.height);
		ctx.putImageData(crop, source.x, source.y);
	} else {
		ctx.drawImage(
			atlas,
			slice.atlasX,
			slice.atlasY,
			source.width,
			source.height,
			source.x,
			source.y,
			source.width,
			source.height,
		);
	}
	return output;
};

/**
 * Compare two same-size images pixel for pixel. Used by the round-trip
 * test to prove no content was lost.
 * @param a - first image
 * @param b - second image
 * @returns true when every RGBA channel matches
 */
export const pixelsMatch = (
	a: HTMLCanvasElement | HTMLImageElement,
	b: HTMLCanvasElement | HTMLImageElement,
): boolean => {
	if (a.width !== b.width || a.height !== b.height) {
		return false;
	}
	const canvasA = makeCanvas(a.width, a.height);
	const canvasB = makeCanvas(a.width, a.height);
	const ctxA = canvasA.getContext("2d", { willReadFrequently: true });
	const ctxB = canvasB.getContext("2d", { willReadFrequently: true });
	if (!ctxA || !ctxB) {
		throw new Error("2D canvas context unavailable");
	}
	ctxA.drawImage(a, 0, 0);
	ctxB.drawImage(b, 0, 0);
	const dataA = ctxA.getImageData(0, 0, a.width, a.height).data;
	const dataB = ctxB.getImageData(0, 0, a.width, a.height).data;
	for (let i = 0; i < dataA.length; i++) {
		if (dataA[i] !== dataB[i]) {
			return false;
		}
	}
	return true;
};

/**
 * Encode a canvas as a PNG download.
 * @param canvas - the image to save
 * @param fileName - the download file name
 */
export const downloadCanvas = (
	canvas: HTMLCanvasElement,
	fileName: string,
): void => {
	canvas.toBlob((blob) => {
		if (!blob) {
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = URL.createObjectURL(blob);
		anchor.download = fileName;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
	}, "image/png");
};

/**
 * Trigger a text-file download for the JSON metadata.
 * @param text - the serialized metadata
 * @param fileName - the download file name
 */
export const downloadText = (text: string, fileName: string): void => {
	const anchor = document.createElement("a");
	anchor.href = URL.createObjectURL(
		new Blob([text], { type: "application/json" }),
	);
	anchor.download = fileName;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
};
