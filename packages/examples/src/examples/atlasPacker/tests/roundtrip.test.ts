/**
 * melonJS — atlas packer: end-to-end acceptance test.
 * Copyright (C) 2011 - 2026 AltByte Pte Ltd — MIT License.
 *
 * Runs the whole feature on real 2D canvases: generate the 40 built-in
 * icons, pack them into a page no larger than 2048x2048, export the PNG
 * plus JSON metadata, then "reload" the JSON and prove every slice can be
 * restored to its source pixels without overlap or lost content.
 */
import { describe, expect, it } from "vitest";
import {
	composeAtlas,
	generateSampleIcons,
	measureTrim,
	pixelsMatch,
	restoreSlice,
	type SourceImage,
} from "../images";
import { buildMetadata, slicesFromMetadata } from "../metadata";
import { assertNoOverlap, packAtlas } from "../packer";

const PAGE_LIMIT = 2048;

/**
 * Paint a solid rectangle with a transparent frame on all sides, so the
 * trimmer and the rotation path both have real work to do.
 * @param name - the frame name
 * @param width - source width
 * @param height - source height
 * @returns a source image with its measured trim
 */
const makeRectSource = (
	name: string,
	width: number,
	height: number,
): SourceImage => {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) {
		throw new Error("2D canvas context unavailable");
	}
	ctx.fillStyle = "#3aa0ff";
	ctx.fillRect(3, 2, width - 6, height - 4);
	return {
		record: {
			name,
			sourceWidth: width,
			sourceHeight: height,
			trim: measureTrim(canvas),
		},
		image: canvas,
	};
};

describe("atlas packer round trip", () => {
	it("packs the 40 built-in icons into a <=2048 page and restores every slice", () => {
		const sources = generateSampleIcons();
		expect(sources).toHaveLength(40);

		const items = sources.map(({ record }) => ({
			name: record.name,
			width: record.trim.width,
			height: record.trim.height,
		}));
		const options = {
			maxWidth: PAGE_LIMIT,
			maxHeight: PAGE_LIMIT,
			padding: 2,
			margin: 1,
			rotate: true,
		};

		const result = packAtlas(items, options);
		expect(result.overflow).toHaveLength(0);
		expect(result.frames).toHaveLength(40);
		expect(result.bounds.width).toBeLessThanOrEqual(PAGE_LIMIT);
		expect(result.bounds.height).toBeLessThanOrEqual(PAGE_LIMIT);
		expect(result.utilization).toBeGreaterThan(0);
		expect(result.utilization).toBeLessThanOrEqual(1);
		console.log(
			`packed 40 icons into ${result.bounds.width}x${result.bounds.height}`,
			`utilization=${(result.utilization * 100).toFixed(2)}%`,
			`rotated=${result.frames.filter((frame) => frame.rotated).length}`,
		);
		expect(() => assertNoOverlap(result.frames)).not.toThrow();

		const byName = new Map(
			sources.map((source) => [source.record.name, source]),
		);
		const records = new Map(
			sources.map((source) => [source.record.name, source.record]),
		);
		const metadata = buildMetadata(
			records,
			result.frames,
			options,
			"atlas.png",
		);

		// composite the atlas exactly as the export button would
		const atlas = composeAtlas(
			result.frames.map((frame) => ({
				source: byName.get(frame.name) as SourceImage,
				frame,
			})),
			options.maxWidth,
			options.maxHeight,
			options.margin,
		);
		expect(atlas.width).toBe(PAGE_LIMIT);
		expect(atlas.height).toBe(PAGE_LIMIT);

		// simulate reloading the JSON from disk, then recover each slice
		const reloaded = JSON.parse(JSON.stringify(metadata)) as typeof metadata;
		const slices = slicesFromMetadata(reloaded);
		expect(slices).toHaveLength(40);

		for (const slice of slices) {
			const source = byName.get(slice.name);
			expect(source).toBeDefined();
			const restored = restoreSlice(atlas, slice);
			expect(restored.width).toBe(source?.record.sourceWidth);
			expect(restored.height).toBe(source?.record.sourceHeight);
			expect(pixelsMatch(restored, source?.image as HTMLCanvasElement)).toBe(
				true,
			);
		}
	});

	it("also round-trips with trimming and rotation forced on narrow pages", () => {
		// the tool default page (512) packs the sample set tightly while
		// staying well under the 2048 acceptance ceiling.
		const defaultOptions = {
			maxWidth: 512,
			maxHeight: 512,
			padding: 2,
			margin: 1,
			rotate: true,
		};
		const defaultPack = packAtlas(
			generateSampleIcons().map(({ record }) => ({
				name: record.name,
				width: record.trim.width,
				height: record.trim.height,
			})),
			defaultOptions,
		);
		expect(defaultPack.overflow).toHaveLength(0);
		expect(defaultPack.bounds.width).toBeLessThanOrEqual(512);
		expect(defaultPack.bounds.height).toBeLessThanOrEqual(512);
		expect(defaultPack.utilization).toBeGreaterThan(0.15);
		console.log(
			`512 page: bounds=${defaultPack.bounds.width}x${defaultPack.bounds.height}`,
			`utilization=${(defaultPack.utilization * 100).toFixed(2)}%`,
		);

		// build wide rectangular icons whose upright footprint cannot fit a
		// narrow column but whose rotated footprint can, so the packer must
		// rotate them.
		const sources = Array.from({ length: 6 }, (_, index) =>
			makeRectSource(`wide-${index}.png`, 90, 24 + index * 4),
		);
		const items = sources.map(({ record }) => ({
			name: record.name,
			width: record.trim.width,
			height: record.trim.height,
		}));
		const options = {
			maxWidth: 64,
			maxHeight: 1024,
			padding: 1,
			margin: 2,
			rotate: true,
		};
		const result = packAtlas(items, options);
		expect(result.overflow).toHaveLength(0);
		expect(result.frames.some((frame) => frame.rotated)).toBe(true);
		expect(() => assertNoOverlap(result.frames)).not.toThrow();

		const byName = new Map(
			sources.map((source) => [source.record.name, source]),
		);
		const records = new Map(
			sources.map((source) => [source.record.name, source.record]),
		);
		const atlas = composeAtlas(
			result.frames.map((frame) => ({
				source: byName.get(frame.name) as SourceImage,
				frame,
			})),
			options.maxWidth,
			options.maxHeight,
			options.margin,
		);
		const metadata = JSON.parse(
			JSON.stringify(
				buildMetadata(records, result.frames, options, "atlas.png"),
			),
		) as ReturnType<typeof buildMetadata>;

		for (const slice of slicesFromMetadata(metadata)) {
			const source = byName.get(slice.name) as SourceImage;
			expect(pixelsMatch(restoreSlice(atlas, slice), source.image)).toBe(true);
		}
	});
});
